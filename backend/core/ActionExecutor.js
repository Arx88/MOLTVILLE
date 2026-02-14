import { logger as defaultLogger } from '../utils/logger.js';

const sanitizeForLog = (value, max = 240) => {
  if (value === null || value === undefined) return null;
  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
};

const displayName = (name) => {
  const raw = String(name || '').trim();
  if (!raw) return 'unknown';
  return raw.replace(/\s*\[NPC\]\s*$/i, '').trim();
};

const normalizeUtterance = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export class ActionExecutor {
  constructor({
    worldState,
    registry,
    interactionEngine,
    economyManager,
    negotiationService,
    commitmentManager,
    favorLedger,
    reputationManager,
    actionQueue,
    io,
    logger = defaultLogger
  }) {
    this.worldState = worldState;
    this.registry = registry;
    this.interactionEngine = interactionEngine;
    this.economyManager = economyManager;
    this.negotiationService = negotiationService;
    this.commitmentManager = commitmentManager;
    this.favorLedger = favorLedger;
    this.reputationManager = reputationManager;
    this.actionQueue = actionQueue;
    this.io = io;
    this.logger = logger;
    this.lastUtteranceByAgent = new Map();
    this.lastUtteranceGlobal = new Map();
    this.speechRepeatWindowMs = Math.max(
      5000,
      Number.parseInt(process.env.AUTONOMY_SPEECH_REPEAT_WINDOW_MS || '45000', 10) || 45000
    );
    this.globalSpeechRepeatWindowMs = Math.max(
      this.speechRepeatWindowMs,
      Number.parseInt(process.env.AUTONOMY_GLOBAL_SPEECH_REPEAT_WINDOW_MS || '60000', 10) || 60000
    );
    this.allowNonSocialSpeech = String(process.env.AUTONOMY_SPEAK_NON_SOCIAL || 'false').trim().toLowerCase() === 'true';
  }

  shouldAllowUtterance(actionType) {
    if (this.allowNonSocialSpeech) return true;
    const socialActions = new Set([
      'social_action',
      'negotiate_propose',
      'negotiate_counter',
      'negotiate_accept',
      'commitment_declare',
      'favor_create',
      'favor_repay'
    ]);
    return socialActions.has(String(actionType || ''));
  }

  cleanupSpeechMemory(now = Date.now()) {
    this.lastUtteranceByAgent.forEach((value, key) => {
      if (!value || now - value.at > this.speechRepeatWindowMs) {
        this.lastUtteranceByAgent.delete(key);
      }
    });
    this.lastUtteranceGlobal.forEach((value, key) => {
      if (!value || now - value.at > this.globalSpeechRepeatWindowMs) {
        this.lastUtteranceGlobal.delete(key);
      }
    });
  }

  shouldEmitUtterance(agentId, utterance) {
    const normalized = normalizeUtterance(utterance);
    if (!normalized) return false;
    const now = Date.now();
    this.cleanupSpeechMemory(now);
    const previous = this.lastUtteranceByAgent.get(agentId);
    if (previous && previous.text === normalized && now - previous.at < this.speechRepeatWindowMs) {
      return false;
    }
    const globalPrevious = this.lastUtteranceGlobal.get(normalized);
    if (globalPrevious && globalPrevious.agentId !== agentId && now - globalPrevious.at < this.globalSpeechRepeatWindowMs) {
      return false;
    }
    this.lastUtteranceByAgent.set(agentId, { text: normalized, at: now });
    this.lastUtteranceGlobal.set(normalized, { agentId, at: now });
    return true;
  }

  emitSpeech(agentId, message, meta = {}) {
    const agent = this.registry.getAgent(agentId);
    const utterance = String(message || '').replace(/\s+/g, ' ').trim();
    if (!utterance) return;
    if (!this.shouldEmitUtterance(agentId, utterance)) return;

    this.io?.emit('agent:spoke', {
      agentId,
      agentName: agent?.name || null,
      message: utterance,
      source: meta.source || 'llm_autonomy',
      behavior: meta.behavior || null
    });

    this.logger.info('AGENT_SAY', {
      agentId,
      agentName: displayName(agent?.name),
      utterance,
      source: meta.source || 'llm_autonomy',
      behavior: meta.behavior || null,
      traceId: meta.traceId || null
    });
  }

  logAction(agentId, actionType, target, params, traceId = null) {
    const agent = this.registry.getAgent(agentId);
    this.logger.info('AGENT_DO', {
      agentId,
      agentName: displayName(agent?.name),
      actionType,
      target: sanitizeForLog(target, 200),
      params: sanitizeForLog(params, 280),
      traceId
    });
  }

  async execute({ agentId, decision, traceId = null }) {
    const agent = this.registry.getAgent(agentId);
    if (!agent) {
      throw new Error(`agent_not_found:${agentId}`);
    }

    const action = decision?.action || {};
    const params = action?.params || {};
    const target = action?.target || null;
    const shouldSpeak = this.shouldAllowUtterance(action.type);
    if (decision?.utterance && shouldSpeak) {
      this.emitSpeech(agentId, decision.utterance, {
        source: 'llm_autonomy',
        behavior: action.type || null,
        traceId
      });
    }

    switch (action.type) {
      case 'none': {
        this.logAction(agentId, 'none', target, params, traceId);
        return { status: 'noop', actionType: 'none' };
      }
      case 'move_to_position': {
        const x = Number(params.x);
        const y = Number(params.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error('move_to_position_requires_xy');
        }
        const result = this.worldState.moveAgentTo(agentId, Math.floor(x), Math.floor(y));
        this.logAction(agentId, 'move_to_position', { x: Math.floor(x), y: Math.floor(y) }, params, traceId);
        return { status: 'ok', actionType: 'move_to_position', result };
      }
      case 'move_to_agent': {
        const targetId = target || params.targetId;
        if (!targetId) throw new Error('move_to_agent_requires_target');
        const targetPos = this.worldState.getAgentPosition(targetId);
        if (!targetPos) throw new Error('move_to_agent_target_not_found');
        const result = this.worldState.moveAgentTo(agentId, targetPos.x, targetPos.y);
        this.logAction(agentId, 'move_to_agent', targetId, params, traceId);
        return { status: 'ok', actionType: 'move_to_agent', result };
      }
      case 'move_to_building': {
        const buildingId = target || params.buildingId;
        if (!buildingId) throw new Error('move_to_building_requires_target');
        const building = this.worldState.buildings.find((entry) => entry.id === buildingId);
        if (!building) throw new Error('move_to_building_not_found');
        const tx = building.x + Math.floor(building.width / 2);
        const ty = building.y + Math.floor(building.height / 2);
        const result = this.worldState.moveAgentTo(agentId, tx, ty);
        this.logAction(agentId, 'move_to_building', buildingId, { tx, ty }, traceId);
        return { status: 'ok', actionType: 'move_to_building', result };
      }
      case 'social_action': {
        const targetId = target || params.targetId;
        const actionType = String(params.actionType || 'wave').trim();
        if (!targetId) throw new Error('social_action_requires_target');
        const payload = params.payload && typeof params.payload === 'object' ? params.payload : {};
        const result = await this.interactionEngine.performSocialAction(agentId, actionType, targetId, payload);
        this.logAction(agentId, 'social_action', targetId, { actionType, payload }, traceId);
        return { status: 'ok', actionType: 'social_action', result };
      }
      case 'queue_action': {
        const actionType = String(params.actionType || '').trim();
        if (!actionType) throw new Error('queue_action_requires_actionType');
        await this.actionQueue.enqueue({
          type: 'ACTION',
          agentId,
          actionType,
          target: params.target || target || null,
          params: params.params || {},
          timestamp: Date.now()
        });
        this.logAction(agentId, 'queue_action', target, params, traceId);
        return { status: 'ok', actionType: 'queue_action' };
      }
      case 'apply_job': {
        const jobId = target || params.jobId;
        if (!jobId) throw new Error('apply_job_requires_jobId');
        const result = this.economyManager.applyForJob(agentId, jobId);
        this.logAction(agentId, 'apply_job', jobId, params, traceId);
        return { status: 'ok', actionType: 'apply_job', result };
      }
      case 'vote_job': {
        const applicantId = params.applicantId;
        const jobId = target || params.jobId;
        if (!applicantId || !jobId) throw new Error('vote_job_requires_applicant_and_job');
        const result = this.economyManager.voteForJob({
          applicantId,
          voterId: agentId,
          jobId,
          reputationManager: this.reputationManager,
          moltbotRegistry: this.registry
        });
        this.logAction(agentId, 'vote_job', applicantId, { jobId }, traceId);
        return { status: 'ok', actionType: 'vote_job', result };
      }
      case 'negotiate_propose': {
        const to = target || params.to;
        const ask = params.ask;
        const offer = params.offer;
        if (!to || typeof ask !== 'object' || typeof offer !== 'object') {
          throw new Error('negotiate_propose_requires_to_ask_offer');
        }
        const result = this.negotiationService.propose({ from: agentId, to, ask, offer, reason: params.reason || '' });
        this.logAction(agentId, 'negotiate_propose', to, { ask, offer }, traceId);
        return { status: 'ok', actionType: 'negotiate_propose', result };
      }
      case 'negotiate_counter': {
        const negotiationId = target || params.negotiationId;
        if (!negotiationId) throw new Error('negotiate_counter_requires_negotiationId');
        const result = this.negotiationService.counter(negotiationId, {
          ask: params.ask,
          offer: params.offer
        });
        this.logAction(agentId, 'negotiate_counter', negotiationId, params, traceId);
        return { status: 'ok', actionType: 'negotiate_counter', result };
      }
      case 'negotiate_accept': {
        const negotiationId = target || params.negotiationId;
        if (!negotiationId) throw new Error('negotiate_accept_requires_negotiationId');
        const result = this.negotiationService.accept(negotiationId);
        this.logAction(agentId, 'negotiate_accept', negotiationId, params, traceId);
        return { status: 'ok', actionType: 'negotiate_accept', result };
      }
      case 'commitment_declare': {
        const text = String(params.text || decision.goal || '').trim();
        const counterpartId = target || params.counterpartId || null;
        if (!text) throw new Error('commitment_declare_requires_text');
        const result = this.commitmentManager.declare({
          agentId,
          counterpartId,
          text,
          source: 'llm_autonomy',
          semantic: params.semantic || {},
          dueAt: params.dueAt || null
        });
        this.logAction(agentId, 'commitment_declare', counterpartId, { text }, traceId);
        return { status: 'ok', actionType: 'commitment_declare', result };
      }
      case 'favor_create': {
        const to = target || params.to;
        const value = Number(params.value || 1);
        if (!to) throw new Error('favor_create_requires_target');
        const result = this.favorLedger.createFavor({
          from: agentId,
          to,
          value,
          reason: params.reason || 'llm_autonomy',
          dueAt: params.dueAt,
          dueInMs: params.dueInMs
        });
        if (this.reputationManager) {
          this.reputationManager.adjust(result.to, 0.8, { reason: 'favor_delivered', favorId: result.id, from: result.from, to: result.to });
          this.reputationManager.adjust(result.from, 0.1, { reason: 'favor_received', favorId: result.id, from: result.from, to: result.to });
        }
        this.logAction(agentId, 'favor_create', to, { value }, traceId);
        return { status: 'ok', actionType: 'favor_create', result };
      }
      case 'favor_repay': {
        const to = target || params.to;
        const value = Number(params.value || 1);
        if (!to) throw new Error('favor_repay_requires_target');
        const result = this.favorLedger.repayFavor({ from: agentId, to, value });
        if (this.reputationManager) {
          this.reputationManager.adjust(agentId, 1.1, { reason: 'favor_repaid', to, value });
          this.reputationManager.adjust(to, 0.35, { reason: 'favor_settlement_received', from: agentId, value });
        }
        this.logAction(agentId, 'favor_repay', to, { value }, traceId);
        return { status: 'ok', actionType: 'favor_repay', result };
      }
      default:
        throw new Error(`unknown_action_type:${action.type}`);
    }
  }
}

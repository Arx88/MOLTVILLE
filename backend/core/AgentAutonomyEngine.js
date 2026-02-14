import { randomUUID } from 'crypto';

import { logger as defaultLogger } from '../utils/logger.js';
import { ActionExecutor } from './ActionExecutor.js';
import { parseAndValidateDecision } from './AutonomyDecisionSchema.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFloat = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalize = (value) => String(value || '').trim().toLowerCase();

const displayName = (name) => String(name || '').replace(/\s*\[NPC\]\s*$/i, '').trim() || 'unknown';

const stableStringify = (value) => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export class AgentAutonomyEngine {
  constructor({
    io,
    worldState,
    registry,
    interactionEngine,
    economyManager,
    negotiationService,
    commitmentManager,
    favorLedger,
    reputationManager,
    actionQueue,
    logger = defaultLogger
  }) {
    this.io = io;
    this.worldState = worldState;
    this.registry = registry;
    this.interactionEngine = interactionEngine;
    this.economyManager = economyManager;
    this.negotiationService = negotiationService;
    this.commitmentManager = commitmentManager;
    this.favorLedger = favorLedger;
    this.reputationManager = reputationManager;
    this.actionQueue = actionQueue;
    this.logger = logger;

    this.config = {
      enabled: normalize(process.env.AUTONOMY_ENGINE_V2 || 'true') !== 'false',
      includeNPCs: normalize(process.env.AUTONOMY_INCLUDE_NPCS || 'true') !== 'false',
      minThinkMs: toInt(process.env.AUTONOMY_AGENT_MIN_INTERVAL_MS, 8000),
      maxThinkMs: toInt(process.env.AUTONOMY_AGENT_MAX_INTERVAL_MS, 45000),
      jitterMs: toInt(process.env.AUTONOMY_AGENT_JITTER_MS, 2500),
      timeoutMs: toInt(process.env.AUTONOMY_LLM_TIMEOUT_MS, 12000),
      maxAttempts: toInt(process.env.AUTONOMY_LLM_MAX_ATTEMPTS, 2),
      temperature: toFloat(process.env.AUTONOMY_LLM_TEMPERATURE, 0.75),
      maxTokens: toInt(process.env.AUTONOMY_LLM_MAX_TOKENS, 240),
      provider: process.env.AUTONOMY_LLM_PROVIDER || process.env.NPC_DIALOGUE_PROVIDER || 'ollama',
      model: process.env.AUTONOMY_LLM_MODEL || process.env.NPC_DIALOGUE_MODEL || 'qwen3:8b',
      baseUrl: process.env.AUTONOMY_LLM_BASE_URL || process.env.NPC_DIALOGUE_BASE_URL || '',
      apiKey: process.env.AUTONOMY_LLM_API_KEY || process.env.NPC_DIALOGUE_API_KEY || '',
      failureCooldownMs: toInt(process.env.AUTONOMY_FAILURE_COOLDOWN_MS, 15000),
      maxFailuresBeforeCooldown: toInt(process.env.AUTONOMY_MAX_FAILURES_BEFORE_COOLDOWN, 3)
    };

    this.sessions = new Map();

    this.actionExecutor = new ActionExecutor({
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
      logger
    });

    if (this.config.enabled) {
      this.logger.info('AgentAutonomyEngine enabled', {
        provider: this.config.provider,
        model: this.config.model,
        includeNPCs: this.config.includeNPCs
      });
    } else {
      this.logger.info('AgentAutonomyEngine disabled by config');
    }
  }

  onAgentConnected(agentId) {
    if (!this.config.enabled || !agentId) return;
    const session = this.ensureSession(agentId);
    session.nextThinkAt = Date.now() + 500;
    session.disabledUntil = 0;
  }

  onAgentDisconnected(agentId) {
    if (!agentId) return;
    const session = this.sessions.get(agentId);
    if (!session) return;
    session.nextThinkAt = Date.now() + this.config.maxThinkMs;
  }

  ensureSession(agentId) {
    if (this.sessions.has(agentId)) return this.sessions.get(agentId);
    const now = Date.now();
    const session = {
      agentId,
      nextThinkAt: now + Math.floor(Math.random() * 2000),
      disabledUntil: 0,
      failures: 0,
      running: false,
      lastTraceId: null,
      lastDecisionAt: 0,
      lastActionSignature: null,
      lastDecisionPosition: null,
      repeatNoProgressCount: 0
    };
    this.sessions.set(agentId, session);
    return session;
  }

  isAgentEligible(agent) {
    if (!agent) return false;
    if (agent.isNPC) {
      return this.config.includeNPCs && Boolean(this.worldState.getAgentPosition(agent.id));
    }
    return Boolean(agent.connected && this.worldState.getAgentPosition(agent.id));
  }

  syncSessions(now = Date.now()) {
    const agents = this.registry.getAllAgents().filter((agent) => this.isAgentEligible(agent));
    const seen = new Set();

    agents.forEach((agent) => {
      seen.add(agent.id);
      const session = this.ensureSession(agent.id);
      if (session.nextThinkAt < now - this.config.maxThinkMs) {
        session.nextThinkAt = now + 500;
      }
    });

    Array.from(this.sessions.keys()).forEach((agentId) => {
      if (!seen.has(agentId)) {
        this.sessions.delete(agentId);
      }
    });
  }

  tick(now = Date.now()) {
    if (!this.config.enabled) return;
    this.syncSessions(now);

    this.sessions.forEach((session, agentId) => {
      if (session.running) return;
      if (now < session.nextThinkAt) return;
      if (now < session.disabledUntil) return;
      void this.runDecisionCycle(agentId, session);
    });
  }

  getBaseUrl() {
    const configured = String(this.config.baseUrl || '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    if (normalize(this.config.provider).includes('ollama')) {
      return 'http://127.0.0.1:11434';
    }
    return 'https://api.openai.com';
  }

  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutMs = Math.max(1500, this.config.timeoutMs);
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  buildObservation(agentId) {
    const agent = this.registry.getAgent(agentId);
    const view = this.worldState.getAgentView(agentId) || {};
    const econ = this.economyManager.getAgentSummary?.(agentId) || {};
    const favor = this.favorLedger.getSummary?.(agentId) || {};
    const risk = this.favorLedger.getRiskProfile?.(agentId) || {};
    const negotiations = this.negotiationService.listForAgent?.(agentId) || [];
    const commitments = this.commitmentManager.mine?.(agentId) || [];
    const pendingApplication = this.economyManager.getApplicationForAgent?.(agentId) || null;

    return {
      timestamp: Date.now(),
      agent: {
        id: agent?.id,
        name: agent?.name,
        isNPC: Boolean(agent?.isNPC),
        profile: agent?.profile || null,
        traits: agent?.traits || null,
        motivation: agent?.motivation || null,
        plan: agent?.plan || null,
        cognition: agent?.cognition || null
      },
      position: view.position || null,
      world: {
        weather: this.worldState.getWeatherState?.()?.current || null,
        phase: this.worldState.getTimeState?.()?.phase || null,
        tick: this.worldState.getCurrentTick?.() || null
      },
      nearbyAgents: (view.nearbyAgents || []).slice(0, 8),
      nearbyBuildings: (view.nearbyBuildings || []).slice(0, 8).map((entry) => ({
        id: entry.id,
        name: entry.name,
        type: entry.type,
        occupants: entry.occupants
      })),
      economy: {
        balance: this.economyManager.getBalance?.(agentId),
        job: econ.job || null,
        pendingApplication,
        jobsOpen: this.economyManager.listJobs()
          .filter((job) => !job.assignedTo)
          .slice(0, 8)
          .map((job) => ({
            id: job.id,
            role: job.role,
            salary: job.salary,
            buildingId: job.buildingId,
            buildingName: job.buildingName
          }))
      },
      social: {
        favor,
        risk,
        negotiations: negotiations.slice(-8).map((item) => ({
          id: item.id,
          from: item.from,
          to: item.to,
          status: item.status,
          reason: item.reason
        })),
        commitments: commitments.slice(0, 8).map((item) => ({
          id: item.id,
          counterpartId: item.counterpartId,
          text: item.text,
          status: item.status,
          dueAt: item.dueAt
        }))
      }
    };
  }

  buildMessages(observation) {
    const actionGuide = [
      'none',
      'move_to_position (params: {x,y})',
      'move_to_agent (target: agentId)',
      'move_to_building (target: buildingId)',
      'social_action (target: agentId, params.actionType)',
      'queue_action (params.actionType, params.target, params.params)',
      'apply_job (target: jobId)',
      'vote_job (params.applicantId, target/jobId)',
      'negotiate_propose (target: agentId, params.ask, params.offer)',
      'negotiate_counter (target/params.negotiationId, params.ask/offer)',
      'negotiate_accept (target/params.negotiationId)',
      'commitment_declare (params.text, optional target counterparty)',
      'favor_create (target: agentId, params.value)',
      'favor_repay (target: agentId, params.value)'
    ].join(', ');

    return [
      {
        role: 'system',
        content: [
          'You are an autonomous agent planner for a persistent simulation world.',
          'Decide goal, thought, and one immediate action based only on observed world state.',
          'No scripted fallback lines. If uncertain, return action type "none" and explain in thought.',
          'If economy.pendingApplication exists, do not use apply_job again for the same jobId.',
          `Allowed action types: ${actionGuide}.`,
          'Return ONLY valid JSON with keys: goal, thought, action { type, target, params }, utterance, nextThinkMs.',
          'Do not use markdown or extra text.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify(observation)
      }
    ];
  }

  async requestDecision(messages) {
    const provider = normalize(this.config.provider);
    const baseUrl = this.getBaseUrl();

    if (provider.includes('ollama')) {
      const response = await this.fetchWithTimeout(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          stream: false,
          options: {
            temperature: this.config.temperature
          },
          messages
        })
      });
      if (!response.ok) {
        throw new Error(`ollama_http_${response.status}`);
      }
      const data = await response.json();
      return data?.message?.content || data?.response || '';
    }

    const headers = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    const response = await this.fetchWithTimeout(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        messages,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`openai_http_${response.status}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || '';
  }

  emitTrace(payload) {
    const event = {
      ...payload,
      timestamp: Date.now()
    };
    this.io?.to('viewers').emit('agent:autonomy_trace', event);
  }

  buildActionSignature(decision) {
    const action = decision?.action || {};
    return [
      action.type || 'none',
      action.target || '',
      stableStringify(action.params || {})
    ].join('|');
  }

  applyDecisionGuards(agentId, decision, observation, session) {
    const safeDecision = {
      ...decision,
      action: {
        ...(decision?.action || {}),
        params: { ...((decision?.action || {}).params || {}) }
      }
    };

    const pendingApplication = observation?.economy?.pendingApplication || null;
    const actionType = safeDecision.action.type;
    const targetJobId = safeDecision.action.target || safeDecision.action.params?.jobId || null;
    if (
      actionType === 'apply_job'
      && pendingApplication
      && (!targetJobId || pendingApplication.jobId === targetJobId)
    ) {
      this.logger.info('AGENT_GUARD', {
        agentId,
        reason: 'pending_job_application',
        pendingJobId: pendingApplication.jobId,
        requestedJobId: targetJobId
      });
      safeDecision.action = { type: 'none', target: null, params: {} };
      safeDecision.utterance = '';
      safeDecision.nextThinkMs = Math.max(6000, Number(safeDecision.nextThinkMs) || 6000);
      safeDecision.thought = `${safeDecision.thought || 'Waiting for state change.'} Pending job application still active.`;
    }

    const pos = observation?.position || {};
    const positionKey = `${pos.x ?? 'x'}:${pos.y ?? 'y'}`;
    const signature = this.buildActionSignature(safeDecision);
    if (session.lastActionSignature === signature && session.lastDecisionPosition === positionKey) {
      session.repeatNoProgressCount += 1;
    } else {
      session.repeatNoProgressCount = 0;
    }

    if (session.repeatNoProgressCount >= 3 && safeDecision.action.type !== 'none') {
      this.logger.info('AGENT_GUARD', {
        agentId,
        reason: 'repeated_no_progress',
        actionType: safeDecision.action.type,
        count: session.repeatNoProgressCount
      });
      safeDecision.action = { type: 'none', target: null, params: {} };
      safeDecision.utterance = '';
      safeDecision.nextThinkMs = Math.max(8000, Number(safeDecision.nextThinkMs) || 8000);
      safeDecision.thought = `${safeDecision.thought || 'Holding.'} No progress in repeated action; pausing to resample context.`;
    }

    session.lastActionSignature = this.buildActionSignature(safeDecision);
    session.lastDecisionPosition = positionKey;
    return safeDecision;
  }

  scheduleNext(session, baseMs = null) {
    const minMs = Math.max(1500, this.config.minThinkMs);
    const maxMs = Math.max(minMs, this.config.maxThinkMs);
    const raw = Number.isFinite(baseMs) ? baseMs : minMs;
    const clamped = clamp(Math.floor(raw), minMs, maxMs);
    const jitter = Math.floor((Math.random() * 2 - 1) * this.config.jitterMs);
    session.nextThinkAt = Date.now() + Math.max(1200, clamped + jitter);
  }

  async runDecisionCycle(agentId, session) {
    session.running = true;
    const traceId = randomUUID();
    session.lastTraceId = traceId;

    try {
      const agent = this.registry.getAgent(agentId);
      if (!this.isAgentEligible(agent)) {
        this.sessions.delete(agentId);
        return;
      }

      const observation = this.buildObservation(agentId);
      const messages = this.buildMessages(observation);

      let llmOutput = '';
      let lastError = null;
      for (let attempt = 1; attempt <= Math.max(1, this.config.maxAttempts); attempt += 1) {
        try {
          llmOutput = await this.requestDecision(messages);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt >= this.config.maxAttempts) {
            throw error;
          }
        }
      }

      if (lastError) {
        throw lastError;
      }

      const parsed = parseAndValidateDecision(llmOutput);
      if (!parsed.valid) {
        throw new Error(`decision_invalid:${parsed.errors.join(',')}`);
      }

      let decision = parsed.value;
      decision = this.applyDecisionGuards(agentId, decision, observation, session);

      this.registry.updateAgentProfile(agentId, {
        plan: decision.goal,
        cognition: {
          internalThought: decision.thought,
          externalIntent: decision.action.type,
          externalSpeech: decision.utterance || ''
        }
      });

      this.logger.info('AGENT_THINK', {
        traceId,
        agentId,
        agentName: displayName(agent?.name),
        goal: decision.goal,
        thought: decision.thought,
        actionType: decision.action.type
      });

      this.logger.info('AGENT_PLAN', {
        traceId,
        agentId,
        agentName: displayName(agent?.name),
        decision
      });

      this.emitTrace({
        traceId,
        agentId,
        agentName: displayName(agent?.name),
        phase: 'plan',
        goal: decision.goal,
        thought: decision.thought,
        action: decision.action,
        utterance: decision.utterance || ''
      });

      const result = await this.actionExecutor.execute({
        agentId,
        decision,
        traceId
      });

      this.emitTrace({
        traceId,
        agentId,
        agentName: displayName(agent?.name),
        phase: 'result',
        result
      });

      session.failures = 0;
      session.disabledUntil = 0;
      session.lastDecisionAt = Date.now();
      this.scheduleNext(session, decision.nextThinkMs);
    } catch (error) {
      session.failures += 1;

      const baseBackoff = this.config.failureCooldownMs * Math.max(1, 2 ** (session.failures - 1));
      const backoffMs = Math.min(this.config.maxThinkMs, baseBackoff);

      if (session.failures >= this.config.maxFailuresBeforeCooldown) {
        session.disabledUntil = Date.now() + backoffMs;
      }

      session.nextThinkAt = Date.now() + backoffMs;

      this.logger.warn('AGENT_BLOCKED', {
        traceId,
        agentId,
        error: error?.message || String(error),
        failures: session.failures,
        backoffMs,
        disabledUntil: session.disabledUntil || null
      });

      this.emitTrace({
        traceId,
        agentId,
        phase: 'blocked',
        error: error?.message || String(error),
        failures: session.failures,
        backoffMs
      });
    } finally {
      session.running = false;
    }
  }
}

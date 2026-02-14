import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { metrics } from '../utils/metrics.js';

export class NPCSpawner {
  constructor({
    registry,
    worldState,
    economyManager,
    interactionEngine,
    votingManager,
    eventManager,
    actionQueue,
    io
  }) {
    this.registry = registry;
    this.worldState = worldState;
    this.economyManager = economyManager;
    this.interactionEngine = interactionEngine;
    this.votingManager = votingManager;
    this.eventManager = eventManager;
    this.actionQueue = actionQueue;
    this.io = io;

    this.activeNPCs = new Map();
    const skillRuntimeConfig = this.loadSkillRuntimeConfig();
    const skillLlmConfig = skillRuntimeConfig.llm || {};
    const skillRuntime = skillRuntimeConfig.runtime || {};

    this.config = {
      minRealAgents: parseInt(process.env.NPC_MIN_REAL_AGENTS || '5', 10),
      maxNPCs: parseInt(process.env.NPC_MAX_COUNT || '4', 10),
      maxNPCRatio: parseFloat(process.env.NPC_MAX_RATIO || '0.5'),
      behaviorIntervalMs: parseInt(process.env.NPC_BEHAVIOR_INTERVAL_MS || '45000', 10),
      despawnGracePeriodMs: parseInt(process.env.NPC_DESPAWN_GRACE_MS || '120000', 10),
      speechMinIntervalMs: parseInt(process.env.NPC_SPEECH_MIN_INTERVAL_MS || '9000', 10),
      speechDuplicateWindowMs: parseInt(process.env.NPC_SPEECH_REPEAT_WINDOW_MS || '60000', 10),
      autonomyEngineV2: String(process.env.AUTONOMY_ENGINE_V2 || 'true').toLowerCase() !== 'false',
      autonomyAllAgents: String(process.env.AUTONOMY_ALL_AGENTS || 'true').toLowerCase() !== 'false',
      dialogueUseModel: String(process.env.NPC_DIALOGUE_USE_MODEL || 'true').toLowerCase() !== 'false',
      dialogueProvider: process.env.NPC_DIALOGUE_PROVIDER || skillLlmConfig.provider || 'ollama',
      dialogueModel: process.env.NPC_DIALOGUE_MODEL || skillLlmConfig.model || 'qwen3:8b',
      dialogueBaseUrl: process.env.NPC_DIALOGUE_BASE_URL || skillLlmConfig.baseUrl || '',
      dialogueApiKey: process.env.NPC_DIALOGUE_API_KEY || skillLlmConfig.apiKey || '',
      dialogueTimeoutMs: parseInt(process.env.NPC_DIALOGUE_TIMEOUT_MS || `${Math.max(12000, (parseInt(skillLlmConfig.timeoutSec || '20', 10) || 20) * 1000)}`, 10),
      dialogueMaxAttempts: parseInt(process.env.NPC_DIALOGUE_MAX_ATTEMPTS || '2', 10),
      dialogueMaxChars: parseInt(process.env.NPC_DIALOGUE_MAX_CHARS || '180', 10),
      dialogueTemperature: Number.parseFloat(process.env.NPC_DIALOGUE_TEMPERATURE || '0.85'),
      dialogueLanguage: process.env.NPC_DIALOGUE_LANGUAGE || skillRuntime.serverLanguage || 'es'
    };
    this.dialogueCircuit = {
      failureCount: 0,
      disabledUntil: 0
    };
    this.autonomousAgents = new Map();
    this.lastSpeechAt = new Map();
    this.recentSpeech = [];
    this.maxRecentSpeech = 160;

    this.archetypes = this.initializeArchetypes();
    this.lastSpawnCheck = 0;
    this.spawnCheckIntervalMs = parseInt(process.env.NPC_SPAWN_CHECK_MS || '30000', 10);

    logger.info('NPCSpawner initialized');
  }

  loadSkillRuntimeConfig() {
    const candidatePaths = [
      path.resolve(process.cwd(), '..', 'skill', 'config.json'),
      path.resolve(process.cwd(), 'skill', 'config.json')
    ];
    for (const configPath of candidatePaths) {
      try {
        if (!fs.existsSync(configPath)) continue;
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch (error) {
        logger.debug('NPCSpawner could not read skill config', {
          path: configPath,
          error: error.message
        });
      }
    }
    return {};
  }

  initializeArchetypes() {
    return {
      gossip: {
        name: 'Chismoso',
        avatars: ['char5', 'char6'],
        personalities: [
          'extroverted, nosy, unreliable, loves drama',
          'chatty, curious, spreads rumors innocently'
        ],
        weight: 25,
        behaviors: ['overhear_conversations', 'spread_rumors', 'create_misunderstandings'],
        dramaPotential: 8
      },
      rival: {
        name: 'Rival',
        avatars: ['char7', 'char8'],
        personalities: [
          'ambitious, competitive, cunning, ruthless',
          'driven, jealous, wants to be the best'
        ],
        weight: 25,
        behaviors: ['compete_for_jobs', 'challenge_leadership', 'undercut_prices'],
        dramaPotential: 9
      },
      agitator: {
        name: 'Instigador',
        avatars: ['char9', 'char10'],
        personalities: [
          'rebellious, provocative, charismatic',
          'revolutionary, anti-establishment, radical'
        ],
        weight: 15,
        behaviors: ['propose_controversial_votes', 'organize_protests', 'incite_debates'],
        dramaPotential: 10
      },
      mentor: {
        name: 'Mentor',
        avatars: ['char11', 'char12'],
        personalities: [
          'wise, helpful, but has hidden agenda',
          'patient, knowledgeable, manipulative'
        ],
        weight: 15,
        behaviors: ['help_new_agents', 'extract_favors', 'create_dependencies'],
        dramaPotential: 7
      },
      merchant: {
        name: 'Comerciante',
        avatars: ['char13', 'char14'],
        personalities: [
          'greedy, shrewd, opportunistic',
          'business-minded, profit-focused, cunning'
        ],
        weight: 10,
        behaviors: ['manipulate_prices', 'hoard_items', 'create_scarcity'],
        dramaPotential: 6
      },
      romantic: {
        name: 'Romántico',
        avatars: ['char15', 'char16'],
        personalities: [
          'passionate, dramatic, obsessive about love',
          'hopeless romantic, jealous, emotional'
        ],
        weight: 10,
        behaviors: ['pursue_relationships', 'create_love_triangles', 'jealousy_outbursts'],
        dramaPotential: 8
      }
    };
  }

  tick() {
    const now = Date.now();
    if (now - this.lastSpawnCheck < this.spawnCheckIntervalMs) {
      return;
    }
    this.lastSpawnCheck = now;

    const allAgents = this.registry.getAllAgents();
    const realAgents = allAgents.filter(agent => !agent.isNPC);
    const npcAgents = allAgents.filter(agent => agent.isNPC);
    const realCount = realAgents.length;
    const npcCount = npcAgents.length;
    const totalCount = realCount + npcCount;

    // Rehydrate activeNPCs from registry (snapshot restore safety)
    if (npcCount > this.activeNPCs.size) {
      npcAgents.forEach(agent => {
        if (!this.activeNPCs.has(agent.id)) {
          this.activeNPCs.set(agent.id, {
            id: agent.id,
            spawnedAt: now,
            lastActionAt: now,
            archetype: 'legacy'
          });
        }
      });
    }

    metrics.population.real = realCount;
    metrics.population.npc = npcCount;
    metrics.population.total = totalCount;

    if (realCount < this.config.minRealAgents) {
      const maxAllowed = Math.min(
        this.config.maxNPCs,
        Math.floor((totalCount || 1) * this.config.maxNPCRatio / (1 - this.config.maxNPCRatio))
      );
      if (npcCount < maxAllowed) {
        const needed = Math.min(
          maxAllowed - npcCount,
          this.config.minRealAgents - realCount
        );
        for (let i = 0; i < needed; i += 1) {
          void this.spawnNPC();
        }
      }
    }

    const maxAllowed = Math.min(
      this.config.maxNPCs,
      Math.floor((totalCount || 1) * this.config.maxNPCRatio / (1 - this.config.maxNPCRatio))
    );

    // Hard cap: if NPCs exceed maxAllowed, despawn extras immediately
    if (npcCount > maxAllowed) {
      const excess = npcCount - maxAllowed;
      const npcList = Array.from(this.activeNPCs.values()).sort((a, b) => a.spawnedAt - b.spawnedAt);
      for (let i = 0; i < excess; i += 1) {
        const npc = npcList[i];
        if (npc) this.despawnNPC(npc.id);
      }
    } else if (realCount >= this.config.minRealAgents + 2 && npcCount > 0) {
      const npc = Array.from(this.activeNPCs.values())[0];
      if (npc && now - npc.spawnedAt > this.config.despawnGracePeriodMs) {
        this.despawnNPC(npc.id);
      }
    }

    if (this.config.autonomyEngineV2) {
      return;
    }

    this.syncAutonomousAgents(now);
    this.getAutonomousActorEntries().forEach(actor => {
      const agent = this.registry.getAgent(actor.id);
      const movement = this.worldState.getAgentMovementState(actor.id);
      const isMoving = agent?.state === 'moving' || (movement && movement.progress < 1);

      if (!isMoving && now - actor.lastActionAt >= this.config.behaviorIntervalMs) {
        actor.lastActionAt = now;
        void this.performBehavior(actor);
      }
    });
  }

  selectArchetype() {
    const entries = Object.entries(this.archetypes);
    const totalWeight = entries.reduce((sum, [, archetype]) => sum + archetype.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const [key, archetype] of entries) {
      if (roll <= archetype.weight) return key;
      roll -= archetype.weight;
    }
    return entries[0][0];
  }

  async spawnNPC() {
    const archetypeKey = this.selectArchetype();
    const template = this.archetypes[archetypeKey];
    const npcId = `npc_${archetypeKey}_${Date.now()}_${uuidv4().slice(0, 8)}`;
    const name = this.generateNPCName(archetypeKey);
    const avatar = template.avatars[Math.floor(Math.random() * template.avatars.length)];
    const personality = template.personalities[Math.floor(Math.random() * template.personalities.length)];
    const apiKey = uuidv4();

    if (typeof this.registry.issueApiKey === 'function') {
      this.registry.issueApiKey(apiKey, { metadata: { npcId } }).catch(error => {
        logger.warn('NPC api key issue failed', { error: error.message });
      });
    }

    const npcAgent = await this.registry.registerAgent({
      id: npcId,
      name: `${name} [NPC]`,
      avatar,
      socketId: null,
      apiKey,
      permissions: ['move', 'speak', 'action', 'converse', 'social', 'perceive'],
      isNPC: true,
      connected: false
    });

    this.economyManager.registerAgent(npcAgent.id);
    const spawnPosition = this.worldState.getRandomSpawnPosition();
    this.worldState.addAgent(npcAgent.id, spawnPosition);

    const npcData = {
      id: npcAgent.id,
      name: npcAgent.name,
      avatar,
      archetype: archetypeKey,
      personality,
      spawnedAt: Date.now(),
      lastActionAt: Date.now(),
      favors: new Map()
    };

    this.activeNPCs.set(npcAgent.id, npcData);
    metrics.npc.spawned += 1;
    metrics.npc.active = this.activeNPCs.size;

    if (this.io) {
      this.io.emit('agent:spawned', {
        id: npcAgent.id,
        name: npcAgent.name,
        avatar: npcAgent.avatar,
        position: spawnPosition,
        isNPC: true
      });
    }

    logger.info(`NPC spawned: ${npcAgent.name} (${archetypeKey})`);
    return npcData;
  }

  despawnNPC(npcId) {
    const npc = this.activeNPCs.get(npcId);
    if (!npc) return;
    this.activeNPCs.delete(npcId);
    this.worldState.removeAgent(npcId);
    this.registry.unregisterAgent(npcId);
    metrics.npc.despawned += 1;
    metrics.npc.active = this.activeNPCs.size;
    if (this.io) {
      this.io.emit('agent:disconnected', { agentId: npcId, agentName: npc.name, isNPC: true });
    }
    logger.info(`NPC despawned: ${npc.name}`);
  }

  resolveAutonomyArchetype(agent = {}) {
    const profileText = [
      agent?.profile ? JSON.stringify(agent.profile) : '',
      agent?.traits ? JSON.stringify(agent.traits) : '',
      agent?.motivation ? JSON.stringify(agent.motivation) : ''
    ].join(' ').toLowerCase();

    if (/(amor|romance|pareja|cita|afecto)/i.test(profileText)) return 'romantic';
    if (/(comercio|negocio|vender|mercado|dinero)/i.test(profileText)) return 'merchant';
    if (/(mentor|ayudar|guiar|enseñar)/i.test(profileText)) return 'mentor';
    if (/(protesta|rebel|agit|polit|debate)/i.test(profileText)) return 'agitator';
    if (/(compet|rival|lider|ambicion)/i.test(profileText)) return 'rival';
    if (/(social|charla|rumor|chisme)/i.test(profileText)) return 'gossip';
    return 'rival';
  }

  syncAutonomousAgents(now = Date.now()) {
    if (!this.config.autonomyAllAgents) {
      this.autonomousAgents.clear();
      return;
    }

    const liveAgents = this.registry.getAllAgents().filter(agent => !agent.isNPC && agent.connected);
    const seen = new Set();
    liveAgents.forEach((agent) => {
      seen.add(agent.id);
      if (this.autonomousAgents.has(agent.id)) {
        const current = this.autonomousAgents.get(agent.id);
        current.name = agent.name;
        return;
      }
      this.autonomousAgents.set(agent.id, {
        id: agent.id,
        name: agent.name,
        archetype: this.resolveAutonomyArchetype(agent),
        personality: 'adaptativo, orientado a objetivos',
        spawnedAt: now,
        // Trigger first autonomous step quickly after connect.
        lastActionAt: now - Math.max(1000, this.config.behaviorIntervalMs - 1200),
        favors: new Map(),
        isAutonomousReal: true
      });
      logger.info('Agent autonomy enabled', {
        agentId: agent.id,
        agentName: agent.name,
        archetype: this.autonomousAgents.get(agent.id)?.archetype || 'rival'
      });
    });

    Array.from(this.autonomousAgents.keys()).forEach((agentId) => {
      if (!seen.has(agentId)) {
        this.autonomousAgents.delete(agentId);
      }
    });
  }

  getAutonomousActorEntries() {
    const merged = new Map();
    this.activeNPCs.forEach((value, key) => merged.set(key, value));
    this.autonomousAgents.forEach((value, key) => {
      if (!merged.has(key)) merged.set(key, value);
    });
    return Array.from(merged.values());
  }

  getNearestAgentDistance(agentId) {
    const origin = this.worldState.getAgentPosition(agentId);
    if (!origin) return Infinity;
    const peers = this.getAvailableTargets(agentId);
    if (!peers.length) return Infinity;
    let nearest = Infinity;
    peers.forEach((peer) => {
      const pos = this.worldState.getAgentPosition(peer.id);
      if (!pos) return;
      const distance = this.worldState.getDistance(origin, pos);
      if (Number.isFinite(distance) && distance < nearest) {
        nearest = distance;
      }
    });
    return nearest;
  }

  getNearestTarget(agentId) {
    const origin = this.worldState.getAgentPosition(agentId);
    if (!origin) return null;
    const peers = this.getAvailableTargets(agentId);
    if (!peers.length) return null;

    let nearest = null;
    let nearestDistance = Infinity;
    peers.forEach((peer) => {
      const pos = this.worldState.getAgentPosition(peer.id);
      if (!pos) return;
      const distance = this.worldState.getDistance(origin, pos);
      if (Number.isFinite(distance) && distance < nearestDistance) {
        nearest = peer;
        nearestDistance = distance;
      }
    });

    if (!nearest) return null;
    return { ...nearest, distance: nearestDistance };
  }

  moveTowardAgent(agentId, targetId) {
    const targetPos = this.worldState.getAgentPosition(targetId);
    if (!targetPos) return false;
    const offsetX = Math.floor(Math.random() * 5) - 2;
    const offsetY = Math.floor(Math.random() * 5) - 2;
    const tx = targetPos.x + offsetX;
    const ty = targetPos.y + offsetY;
    try {
      this.worldState.moveAgentTo(agentId, tx, ty);
      return true;
    } catch (error) {
      logger.debug(`NPC ${agentId} failed to move toward ${targetId}: ${error.message}`);
      return false;
    }
  }

  attemptJobSearch(agentMeta) {
    const summary = this.economyManager?.getAgentSummary?.(agentMeta.id);
    if (summary?.job) return false;
    if (Math.random() > 0.45) return false;
    const availableJobs = this.economyManager.listJobs().filter(job => !job.assignedTo);
    if (!availableJobs.length) return false;
    const selected = availableJobs[Math.floor(Math.random() * availableJobs.length)];
    try {
      this.economyManager.applyForJob(agentMeta.id, selected.id);
      logger.info('AGENT_DO', {
        agentId: agentMeta.id,
        agentName: this.getDisplayName(agentMeta.name),
        actionType: 'apply_job',
        target: selected.id,
        params: { role: selected.role, building: selected.buildingName }
      });
      return true;
    } catch (error) {
      logger.debug('Autonomy job apply failed', {
        agentId: agentMeta.id,
        error: error.message
      });
      return false;
    }
  }

  updateAutonomyPlan(agentMeta, behavior) {
    if (typeof this.registry?.updateAgentProfile !== 'function') return;
    const plan = `Objetivo actual: ${behavior}`;
    this.registry.updateAgentProfile(agentMeta.id, {
      plan,
      cognition: {
        externalIntent: behavior,
        internalThought: `Resolver ${behavior} con contexto local`
      }
    });
    logger.info('AGENT_THINK', {
      agentId: agentMeta.id,
      agentName: this.getDisplayName(agentMeta.name),
      externalIntent: behavior,
      plan
    });
  }

  generateNPCName(archetypeKey) {
    const namePool = {
      gossip: ['Lola', 'Charly', 'Rita', 'Pepe'],
      rival: ['Dante', 'Vera', 'Marco', 'Iris'],
      agitator: ['Axel', 'Nova', 'Sasha', 'Rafa'],
      mentor: ['Elena', 'Hugo', 'Lucia', 'Bruno'],
      merchant: ['Mara', 'Silvio', 'Greta', 'Noel'],
      romantic: ['Ari', 'Dahlia', 'Leo', 'Carmen']
    };
    const pool = namePool[archetypeKey] || ['Alex'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  getAvailableTargets(excludeId) {
    return this.registry.getAllAgents().filter(agent => agent.id !== excludeId);
  }

  getRandomTarget(excludeId, maxDist = Infinity) {
    const candidates = this.getAvailableTargets(excludeId);
    if (!candidates.length) return null;

    if (maxDist !== Infinity) {
      const myPos = this.worldState.getAgentPosition(excludeId);
      if (myPos) {
        const near = candidates.filter(c => {
          const pos = this.worldState.getAgentPosition(c.id);
          return pos && this.worldState.getDistance(myPos, pos) <= maxDist;
        });
        if (near.length) return near[Math.floor(Math.random() * near.length)];
      }
      return null; // Nobody nearby
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  isAtSocialSpace(npcId) {
    const pos = this.worldState.getAgentPosition(npcId);
    if (!pos) return false;
    const building = this.worldState.getBuildingAt(pos.x, pos.y);
    return building && ['cafe', 'plaza', 'market', 'garden', 'library', 'tower1'].includes(building.type);
  }

  async performBehavior(npc) {
    try {
      const archetype = this.archetypes[npc.archetype];
      if (!archetype) return;
      const behavior = archetype.behaviors[Math.floor(Math.random() * archetype.behaviors.length)];
      this.updateAutonomyPlan(npc, behavior);
      this.attemptJobSearch(npc);

      const nearest = this.getNearestTarget(npc.id);
      const nearestDistance = nearest?.distance ?? Infinity;
      const requiresProximity = new Set([
        'overhear_conversations',
        'spread_rumors',
        'create_misunderstandings',
        'compete_for_jobs',
        'challenge_leadership',
        'undercut_prices',
        'help_new_agents',
        'extract_favors',
        'create_dependencies',
        'pursue_relationships',
        'create_love_triangles',
        'jealousy_outbursts'
      ]);

      if (requiresProximity.has(behavior) && (!nearest || nearestDistance > 5)) {
        if (nearest && this.moveTowardAgent(npc.id, nearest.id)) {
          logger.info('AGENT_DO', {
            agentId: npc.id,
            agentName: this.getDisplayName(npc.name),
            actionType: 'move_toward_agent',
            target: nearest.id,
            params: {
              targetName: this.getDisplayName(nearest.name),
              distance: Number.isFinite(nearestDistance) ? Number(nearestDistance.toFixed(2)) : null
            }
          });
        } else {
          this.moveToSocialSpace(npc.id);
          logger.info('AGENT_DO', {
            agentId: npc.id,
            agentName: this.getDisplayName(npc.name),
            actionType: 'move_social_space',
            target: 'social_space'
          });
        }
        const followUpDelayMs = Math.min(6000, Math.max(1200, Math.floor(this.config.behaviorIntervalMs * 0.25)));
        npc.lastActionAt = Date.now() - (this.config.behaviorIntervalMs - followUpDelayMs);
        return;
      }

      const isSocial = this.isAtSocialSpace(npc.id);
      if (!isSocial && Math.random() < 0.35) {
        this.moveToSocialSpace(npc.id);
      }

      switch (behavior) {
        case 'overhear_conversations':
        case 'spread_rumors':
        case 'create_misunderstandings':
          await this.performGossip(npc);
          break;
        case 'compete_for_jobs':
        case 'challenge_leadership':
        case 'undercut_prices':
          await this.performRivalry(npc);
          break;
        case 'propose_controversial_votes':
        case 'organize_protests':
        case 'incite_debates':
          await this.performAgitation(npc);
          break;
        case 'help_new_agents':
        case 'extract_favors':
        case 'create_dependencies':
          await this.performMentorship(npc);
          break;
        case 'manipulate_prices':
        case 'hoard_items':
        case 'create_scarcity':
          await this.performMerchant(npc);
          break;
        case 'pursue_relationships':
        case 'create_love_triangles':
        case 'jealousy_outbursts':
          await this.performRomance(npc);
          break;
        default:
          break;
      }
    } catch (error) {
      logger.warn(`NPC ${npc.name} behavior failed: ${error.message}`);
    }
  }

  pickFrom(items, fallback = '') {
    if (!Array.isArray(items) || items.length === 0) return fallback;
    return items[Math.floor(Math.random() * items.length)];
  }

  getDisplayName(name) {
    const raw = String(name || '').trim();
    if (!raw) return 'alguien';
    return raw.replace(/\s*\[NPC\]\s*$/i, '').trim();
  }

  getPhaseLabel() {
    const phase = this.worldState?.getTimeState?.()?.phase || 'day';
    const map = {
      morning: 'manana',
      afternoon: 'tarde',
      evening: 'atardecer',
      night: 'noche'
    };
    return map[phase] || 'dia';
  }

  getWeatherLabel() {
    const weather = this.worldState?.getWeatherState?.()?.current || 'clear';
    const map = {
      clear: 'tranquilo',
      rain: 'lluvioso',
      storm: 'electrico',
      snow: 'frio'
    };
    return map[weather] || 'cambiante';
  }

  pickActiveEventName() {
    const activeEvents = this.eventManager?.getSummary?.()?.filter(event => event.status === 'active') || [];
    if (!activeEvents.length) return 'la plaza';
    const event = this.pickFrom(activeEvents);
    return event?.name || 'la plaza';
  }

  pickLocalPlaceName(npcId) {
    const pos = this.worldState?.getAgentPosition?.(npcId);
    if (pos) {
      const building = this.worldState?.getBuildingAt?.(pos.x, pos.y);
      if (building?.name) return building.name;
    }
    return this.pickPlaceName();
  }

  buildSpeechTokens(npc, target = null) {
    return {
      me: this.getDisplayName(npc?.name),
      target: this.getDisplayName(target?.name),
      place: this.pickLocalPlaceName(npc?.id),
      altPlace: this.pickPlaceName(),
      phase: this.getPhaseLabel(),
      weather: this.getWeatherLabel(),
      event: this.pickActiveEventName(),
      reform: `${Math.floor(Math.random() * 100)}`
    };
  }

  canUseDialogueModel() {
    if (!this.config.dialogueUseModel) return false;
    if (!this.config.dialogueModel) return false;
    if (Date.now() < Number(this.dialogueCircuit.disabledUntil || 0)) return false;
    return true;
  }

  getDialogueBaseUrl() {
    const configured = String(this.config.dialogueBaseUrl || '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    const provider = String(this.config.dialogueProvider || '').toLowerCase();
    if (provider.includes('ollama')) {
      return 'http://127.0.0.1:11434';
    }
    return 'https://api.openai.com';
  }

  sanitizeDialogueLine(value) {
    let line = String(value || '')
      .split('\n')
      .map(chunk => chunk.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/^["'`]+|["'`]+$/g, '')
      .trim();

    if (!line) return '';
    const maxChars = Math.max(60, Number(this.config.dialogueMaxChars || 180));
    if (line.length > maxChars) {
      line = `${line.slice(0, maxChars - 3).trim()}...`;
    }
    return line;
  }

  buildDialogueMessages({ npc, target, behavior, tokens }) {
    const npcName = this.getDisplayName(npc?.name);
    const targetName = this.getDisplayName(target?.name);
    const personality = String(npc?.personality || 'dramatico');
    const recent = this.recentSpeech.slice(-4).map(entry => `- ${entry.text}`).join('\n') || '- (sin historial reciente)';
    const language = String(this.config.dialogueLanguage || 'es');

    return [
      {
        role: 'system',
        content: [
          'Eres guionista de dialogos emergentes para una ciudad simulada.',
          `Responde en ${language}.`,
          'Escribe solo UNA linea natural, breve y concreta, sin comillas ni explicaciones.',
          'Evita frases genericas repetitivas y evita tono robótico.',
          'No inventes markdown ni etiquetas.'
        ].join(' ')
      },
      {
        role: 'user',
        content: [
          `Personaje: ${npcName}.`,
          `Arquetipo/persona: ${personality}.`,
          `Comportamiento actual: ${behavior}.`,
          `Interlocutor objetivo: ${targetName || 'sin objetivo directo'}.`,
          `Contexto: lugar=${tokens.place}, clima=${tokens.weather}, fase=${tokens.phase}, evento=${tokens.event}.`,
          'Ultimas frases recientes (no repitas literalmente):',
          recent
        ].join('\n')
      }
    ];
  }

  async fetchWithDialogueTimeout(url, options = {}) {
    const timeoutMs = Math.max(1500, Number(this.config.dialogueTimeoutMs || 4000));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  recordDialogueFailure(error) {
    this.dialogueCircuit.failureCount += 1;
    const failures = this.dialogueCircuit.failureCount;
    const cooldownMs = Math.min(5 * 60 * 1000, 20 * 1000 * failures);
    if (failures >= 4) {
      this.dialogueCircuit.disabledUntil = Date.now() + cooldownMs;
      logger.warn('NPC dialogue model temporarily disabled', {
        failures,
        cooldownMs,
        error: error?.message || String(error)
      });
      return;
    }
    logger.debug('NPC dialogue model call failed', {
      failures,
      error: error?.message || String(error)
    });
  }

  resolveDialogueFallback(reason = 'fallback') {
    return {
      line: '',
      source: 'suppressed',
      reason
    };
  }

  logDialogueTrace({ npc, target = null, behavior, line = '', source, reason = null }) {
    const payload = {
      npcId: npc?.id || null,
      npcName: this.getDisplayName(npc?.name),
      targetId: target?.id || null,
      targetName: target?.name ? this.getDisplayName(target.name) : null,
      behavior,
      source,
      reason,
      line: line || ''
    };
    logger.info({
      message: 'NPC_DIALOGUE',
      ...payload
    });
  }

  async requestDialogueFromModel({ provider, baseUrl, messages }) {
    if (provider.includes('ollama')) {
      const response = await this.fetchWithDialogueTimeout(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.config.dialogueModel,
          stream: false,
          options: {
            temperature: Number.isFinite(this.config.dialogueTemperature)
              ? this.config.dialogueTemperature
              : 0.85
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

    const headers = {
      'Content-Type': 'application/json'
    };
    if (this.config.dialogueApiKey) {
      headers.Authorization = `Bearer ${this.config.dialogueApiKey}`;
    }
    const response = await this.fetchWithDialogueTimeout(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.dialogueModel,
        temperature: Number.isFinite(this.config.dialogueTemperature)
          ? this.config.dialogueTemperature
          : 0.85,
        max_tokens: 80,
        messages
      })
    });
    if (!response.ok) {
      throw new Error(`openai_http_${response.status}`);
    }
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || '';
  }

  async generateDialogueLine({ npc, target = null, behavior, tokens }) {
    if (!this.canUseDialogueModel()) {
      const suppressed = this.resolveDialogueFallback('model_unavailable');
      this.logDialogueTrace({
        npc,
        target,
        behavior,
        line: suppressed.line,
        source: suppressed.source,
        reason: suppressed.reason
      });
      return suppressed;
    }

    const provider = String(this.config.dialogueProvider || 'ollama').toLowerCase();
    const baseUrl = this.getDialogueBaseUrl();
    const messages = this.buildDialogueMessages({
      npc,
      target,
      behavior,
      tokens
    });

    try {
      let content = '';
      const maxAttempts = Math.max(1, Number(this.config.dialogueMaxAttempts || 1));
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          content = await this.requestDialogueFromModel({
            provider,
            baseUrl,
            messages
          });
          break;
        } catch (error) {
          const errorMessage = String(error?.message || '');
          const isTimeout = error?.name === 'AbortError' || errorMessage.toLowerCase().includes('aborted');
          if (!isTimeout || attempt >= maxAttempts) throw error;
          logger.warn('NPC dialogue timeout, retrying request', {
            npcId: npc?.id || null,
            behavior,
            attempt,
            maxAttempts
          });
        }
      }

      const line = this.sanitizeDialogueLine(content);
      if (!line) {
        const emptyResult = this.resolveDialogueFallback('empty_model_output');
        this.logDialogueTrace({
          npc,
          target,
          behavior,
          line: emptyResult.line,
          source: emptyResult.source,
          reason: emptyResult.reason
        });
        return emptyResult;
      }
      this.dialogueCircuit.failureCount = 0;
      this.dialogueCircuit.disabledUntil = 0;
      const result = {
        line,
        source: 'llm',
        reason: null
      };
      this.logDialogueTrace({
        npc,
        target,
        behavior,
        line: result.line,
        source: result.source
      });
      return result;
    } catch (error) {
      this.recordDialogueFailure(error);
      const fallbackResult = this.resolveDialogueFallback(`model_error:${error?.message || 'unknown'}`);
      this.logDialogueTrace({
        npc,
        target,
        behavior,
        line: fallbackResult.line,
        source: fallbackResult.source,
        reason: fallbackResult.reason
      });
      return fallbackResult;
    }
  }

  async performGossip(npc) {
    const target = this.getRandomTarget(npc.id);
    const listener = this.getRandomTarget(npc.id, 2.5); // Must be near to hear gossip
    if (!target || !listener) return;

    const tokens = this.buildSpeechTokens(npc, target);
    const rumorResult = await this.generateDialogueLine({
      npc,
      target,
      behavior: 'spread_rumor',
      tokens
    });
    const rumor = rumorResult?.line || '';
    if (!rumor) return;

    await this.interactionEngine.initiateConversation(npc.id, listener.id, rumor);
    this.emitSpeech(npc.id, npc.name, rumor, {
      source: rumorResult?.source || 'npc_autonomous',
      behavior: 'spread_rumor',
      reason: rumorResult?.reason || null
    });
    metrics.npc.dramaPoints += 4;
  }

  async performRivalry(npc) {
    const target = this.getRichestTarget(npc.id) || this.getRandomTarget(npc.id);
    const listener = this.getRandomTarget(npc.id, 3); // Challenges should be heard by someone
    if (!target) return;

    const tokens = this.buildSpeechTokens(npc, target);
    const messageResult = await this.generateDialogueLine({
      npc,
      target,
      behavior: 'rivalry_challenge',
      tokens
    });
    const message = messageResult?.line || '';

    await this.interactionEngine.performSocialAction(npc.id, 'compete', target.id, { contest: 'liderazgo' });
    if (listener && message) {
      await this.interactionEngine.initiateConversation(npc.id, listener.id, message);
    }
    if (message) {
      this.emitSpeech(npc.id, npc.name, message, {
        source: messageResult?.source || 'npc_autonomous',
        behavior: 'rivalry_challenge',
        reason: messageResult?.reason || null
      });
    }

    const jobs = this.economyManager.listJobs().filter(job => !job.assignedTo);
    if (jobs.length) {
      const job = jobs[Math.floor(Math.random() * jobs.length)];
      try {
        this.economyManager.applyForJob(npc.id, job.id);
      } catch (error) {
        logger.debug('NPC job application failed', { error: error.message });
      }
    }
    metrics.npc.dramaPoints += 6;
  }

  async performAgitation(npc) {
    const tokens = this.buildSpeechTokens(npc);
    const proposalName = `Reforma ${tokens.reform}`;
    try {
      this.votingManager.proposeBuilding({
        agentId: npc.id,
        type: 'civic',
        customName: proposalName
      });
    } catch (error) {
      logger.debug('NPC proposal failed', { error: error.message });
    }

    if (this.eventManager) {
      const eventNames = [
        'Gran Protesta',
        'Mitin Popular',
        'Debate Callejero',
        'Asamblea de Barrio'
      ];
      const eventName = this.pickFrom(eventNames, 'Debate Publico');
      this.eventManager.createEvent({
        name: `${eventName} por ${this.getDisplayName(npc.name)}`,
        type: 'protest',
        startAt: Date.now(),
        endAt: Date.now() + 30 * 60 * 1000,
        location: 'plaza',
        description: `La ciudad debate una nueva ruta para la ${tokens.phase}.`,
        goalScope: 'global'
      });
    }

    const sloganResult = await this.generateDialogueLine({
      npc,
      behavior: 'public_agitation',
      tokens
    });
    const slogan = sloganResult?.line || '';
    if (slogan) {
      this.emitSpeech(npc.id, npc.name, slogan, {
        source: sloganResult?.source || 'npc_autonomous',
        behavior: 'public_agitation',
        reason: sloganResult?.reason || null
      });
    }
    metrics.npc.dramaPoints += 8;
  }

  async performMentorship(npc) {
    const target = this.getRandomTarget(npc.id, 2.5); // Target must be near
    if (!target) return;
    const favorCount = npc.favors.get(target.id) || 0;
    const tokens = this.buildSpeechTokens(npc, target);

    if (favorCount === 0) {
      const supportResult = await this.generateDialogueLine({
        npc,
        target,
        behavior: 'mentor_support',
        tokens
      });
      const supportLine = supportResult?.line || '';
      if (!supportLine) return;

      await this.interactionEngine.performSocialAction(npc.id, 'compliment', target.id, {
        message: supportLine
      });
      npc.favors.set(target.id, 1);
      this.emitSpeech(npc.id, npc.name, supportLine, {
        source: supportResult?.source || 'npc_autonomous',
        behavior: 'mentor_support',
        reason: supportResult?.reason || null
      });
    } else {
      const pressureResult = await this.generateDialogueLine({
        npc,
        target,
        behavior: 'mentor_collect_favor',
        tokens
      });
      const pressureLine = pressureResult?.line || '';
      if (!pressureLine) return;

      await this.interactionEngine.performSocialAction(npc.id, 'betray', target.id, {
        context: 'favor_pendiente'
      });
      npc.favors.set(target.id, favorCount + 1);
      this.emitSpeech(npc.id, npc.name, pressureLine, {
        source: pressureResult?.source || 'npc_autonomous',
        behavior: 'mentor_collect_favor',
        reason: pressureResult?.reason || null
      });
    }
    metrics.npc.dramaPoints += 5;
  }

  async performMerchant(npc) {
    const itemPool = [
      { id: 'bread', name: 'Pan' },
      { id: 'coffee', name: 'Cafe' },
      { id: 'wood', name: 'Madera' },
      { id: 'fruit', name: 'Fruta' }
    ];
    const pickedItem = this.pickFrom(itemPool, itemPool[0]);

    try {
      this.economyManager.addItem(npc.id, {
        itemId: pickedItem.id,
        name: pickedItem.name,
        quantity: 2 + Math.floor(Math.random() * 3)
      });
    } catch (error) {
      logger.debug('NPC merchant add item failed', { error: error.message });
    }

    const tokens = this.buildSpeechTokens(npc);
    const salesResult = await this.generateDialogueLine({
      npc,
      behavior: 'merchant_offer',
      tokens
    });
    const salesLine = salesResult?.line || '';

    if (salesLine) {
      this.emitSpeech(npc.id, npc.name, salesLine, {
        source: salesResult?.source || 'npc_autonomous',
        behavior: 'merchant_offer',
        reason: salesResult?.reason || null
      });
    }
    metrics.npc.dramaPoints += 3;
  }

  async performRomance(npc) {
    const target = this.getRandomTarget(npc.id, 4); // Romance needs proximity
    if (!target) return;

    const tokens = this.buildSpeechTokens(npc, target);
    const romanticResult = await this.generateDialogueLine({
      npc,
      target,
      behavior: 'romance_approach',
      tokens
    });
    const romanticLine = romanticResult?.line || '';
    if (!romanticLine) return;

    await this.interactionEngine.performSocialAction(npc.id, 'compliment', target.id, {
      message: romanticLine
    });
    this.emitSpeech(npc.id, npc.name, romanticLine, {
      source: romanticResult?.source || 'npc_autonomous',
      behavior: 'romance_approach',
      reason: romanticResult?.reason || null
    });
    metrics.npc.dramaPoints += 5;
  }

  pickPlaceName() {
    const worldPlaces = Array.isArray(this.worldState?.buildings)
      ? this.worldState.buildings
        .map(building => building?.name)
        .filter(Boolean)
      : [];
    if (worldPlaces.length > 0) {
      return this.pickFrom(worldPlaces, 'Central Plaza');
    }
    const places = ['Hobbs Cafe', 'Market Square', 'Central Plaza', 'City Hall'];
    return this.pickFrom(places, 'Central Plaza');
  }

  shouldEmitSpeech(agentId, message) {
    const normalized = String(message || '').trim().toLowerCase();
    if (!normalized) return false;

    const now = Date.now();
    const lastAt = this.lastSpeechAt.get(agentId) || 0;
    if (now - lastAt < this.config.speechMinIntervalMs) {
      return false;
    }

    const repeatWindowMs = this.config.speechDuplicateWindowMs;
    this.recentSpeech = this.recentSpeech.filter(entry => now - entry.at < repeatWindowMs);
    const hasRecentDuplicate = this.recentSpeech.some(entry => entry.text === normalized);
    if (hasRecentDuplicate && Math.random() < 0.8) {
      return false;
    }

    this.lastSpeechAt.set(agentId, now);
    this.recentSpeech.push({ text: normalized, at: now });
    if (this.recentSpeech.length > this.maxRecentSpeech) {
      this.recentSpeech.shift();
    }
    return true;
  }

  emitSpeech(agentId, agentName, message, meta = {}) {
    const cleanMessage = String(message || '').replace(/\s+/g, ' ').trim();
    if (!cleanMessage) return;
    if (!this.shouldEmitSpeech(agentId, cleanMessage)) return;
    if (!this.io) return;
    const source = String(meta?.source || 'npc_autonomous').trim() || 'npc_autonomous';
    const behavior = meta?.behavior || null;
    const reason = meta?.reason || null;
    this.io.emit('agent:spoke', {
      agentId,
      agentName,
      message: cleanMessage,
      source,
      behavior
    });
    logger.info('AGENT_SAY', {
      agentId,
      agentName: this.getDisplayName(agentName),
      utterance: cleanMessage,
      source,
      behavior,
      dialogueReason: reason
    });
  }

  moveToSocialSpace(npcId) {
    const socialBuildings = this.worldState.buildings.filter(b => 
      ['cafe', 'plaza', 'market', 'garden', 'library', 'tower1'].includes(b.type)
    );
    if (!socialBuildings.length) return;
    const building = socialBuildings[Math.floor(Math.random() * socialBuildings.length)];
    // Pick a random spot inside the building footprint
    const tx = building.x + Math.floor(Math.random() * building.width);
    const ty = building.y + Math.floor(Math.random() * building.height);
    
    try {
      this.worldState.moveAgentTo(npcId, tx, ty);
    } catch (error) {
      logger.debug(`NPC ${npcId} failed to move to social space: ${error.message}`);
    }
  }

  getRichestTarget(excludeId) {
    let richestId = null;
    let maxBalance = -1;

    for (const [agentId, balance] of this.economyManager.balances.entries()) {
      if (agentId !== excludeId && balance > maxBalance) {
        maxBalance = balance;
        richestId = agentId;
      }
    }

    if (richestId) {
      const agent = this.registry.getAgent(richestId);
      return agent ? { id: richestId, name: agent.name } : null;
    }
    return null;
  }
}




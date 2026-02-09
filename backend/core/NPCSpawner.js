import { v4 as uuidv4 } from 'uuid';
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

    this.config = {
      minRealAgents: parseInt(process.env.NPC_MIN_REAL_AGENTS || '5', 10),
      maxNPCs: parseInt(process.env.NPC_MAX_COUNT || '4', 10),
      maxNPCRatio: parseFloat(process.env.NPC_MAX_RATIO || '0.5'),
      behaviorIntervalMs: parseInt(process.env.NPC_BEHAVIOR_INTERVAL_MS || '45000', 10),
      despawnGracePeriodMs: parseInt(process.env.NPC_DESPAWN_GRACE_MS || '120000', 10)
    };

    this.archetypes = this.initializeArchetypes();
    this.lastSpawnCheck = 0;
    this.spawnCheckIntervalMs = parseInt(process.env.NPC_SPAWN_CHECK_MS || '30000', 10);

    logger.info('NPCSpawner initialized');
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
    const realCount = realAgents.length;
    const npcCount = this.activeNPCs.size;
    const totalCount = realCount + npcCount;

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

    if (realCount >= this.config.minRealAgents + 2 && npcCount > 0) {
      const npc = Array.from(this.activeNPCs.values())[0];
      if (npc && now - npc.spawnedAt > this.config.despawnGracePeriodMs) {
        this.despawnNPC(npc.id);
      }
    }

    this.activeNPCs.forEach(npc => {
      if (now - npc.lastActionAt >= this.config.behaviorIntervalMs) {
        npc.lastActionAt = now;
        void this.performBehavior(npc);
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

  getRandomTarget(excludeId) {
    const candidates = this.getAvailableTargets(excludeId);
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  getRichestTarget(excludeId) {
    const candidates = this.getAvailableTargets(excludeId);
    if (!candidates.length) return null;
    return candidates.reduce((best, candidate) => {
      const candidateBalance = this.economyManager.getBalance(candidate.id);
      const bestBalance = best ? this.economyManager.getBalance(best.id) : -Infinity;
      return candidateBalance > bestBalance ? candidate : best;
    }, null);
  }

  moveToSocialSpace(npcId, preferredTypes = ['plaza', 'cafe', 'market', 'garden']) {
    if (!this.actionQueue) return;
    const buildings = this.worldState.buildings.filter(building => preferredTypes.includes(building.type));
    if (!buildings.length) return;
    const target = buildings[Math.floor(Math.random() * buildings.length)];
    const targetX = target.x + Math.floor(target.width / 2);
    const targetY = target.y + Math.floor(target.height / 2);
    this.actionQueue.enqueue({
      type: 'MOVE_TO',
      agentId: npcId,
      targetX,
      targetY,
      timestamp: Date.now()
    });
  }

  emitSpeech(npcId, npcName, message) {
    const position = this.worldState.getAgentPosition(npcId);
    if (this.io) {
      this.io.emit('agent:spoke', {
        agentId: npcId,
        agentName: npcName,
        message,
        position,
        timestamp: Date.now(),
        isNPC: true
      });
    }
  }

  async performBehavior(npc) {
    const archetype = this.archetypes[npc.archetype];
    if (!archetype) return;
    const behavior = archetype.behaviors[Math.floor(Math.random() * archetype.behaviors.length)];

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
  }

  async performGossip(npc) {
    this.moveToSocialSpace(npc.id, ['cafe', 'plaza', 'market']);
    const target = this.getRandomTarget(npc.id);
    const listener = this.getRandomTarget(npc.id);
    if (!target || !listener) return;
    const rumor = `${target.name} está ocultando algo sobre el trabajo en ${this.pickPlaceName()}.`;
    await this.interactionEngine.initiateConversation(npc.id, listener.id, rumor);
    this.emitSpeech(npc.id, npc.name, rumor);
    metrics.npc.dramaPoints += 4;
  }

  async performRivalry(npc) {
    const target = this.getRichestTarget(npc.id) || this.getRandomTarget(npc.id);
    if (!target) return;
    const message = `Voy a superar a ${target.name} en la próxima votación.`;
    await this.interactionEngine.performSocialAction(npc.id, 'compete', target.id, { contest: 'liderazgo' });
    this.emitSpeech(npc.id, npc.name, message);

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
    const proposalName = `Reforma radical ${Math.floor(Math.random() * 100)}`;
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
      this.eventManager.createEvent({
        name: `Protesta organizada por ${npc.name}`,
        type: 'protest',
        startAt: Date.now(),
        endAt: Date.now() + 30 * 60 * 1000,
        location: 'plaza',
        description: 'Debate encendido en la plaza central.',
        goalScope: 'global'
      });
    }

    this.emitSpeech(npc.id, npc.name, '¡La ciudad necesita un cambio YA!');
    metrics.npc.dramaPoints += 8;
  }

  async performMentorship(npc) {
    const target = this.getRandomTarget(npc.id);
    if (!target) return;
    const favorCount = npc.favors.get(target.id) || 0;
    if (favorCount === 0) {
      await this.interactionEngine.performSocialAction(npc.id, 'compliment', target.id, {
        message: 'Puedo ayudarte a prosperar aquí.'
      });
      npc.favors.set(target.id, 1);
      this.emitSpeech(npc.id, npc.name, `${target.name}, cuenta conmigo si necesitas guía.`);
    } else {
      await this.interactionEngine.performSocialAction(npc.id, 'betray', target.id, {
        context: 'favor pendiente'
      });
      npc.favors.set(target.id, favorCount + 1);
      this.emitSpeech(npc.id, npc.name, `${target.name}, ya es hora de pagar ese favor.`);
    }
    metrics.npc.dramaPoints += 5;
  }

  async performMerchant(npc) {
    this.moveToSocialSpace(npc.id, ['market', 'shop']);
    const itemId = 'bread';
    try {
      this.economyManager.addItem(npc.id, { itemId, name: 'Pan', quantity: 3 });
    } catch (error) {
      logger.debug('NPC merchant add item failed', { error: error.message });
    }
    this.emitSpeech(npc.id, npc.name, 'El pan está escaso... y caro.');
    metrics.npc.dramaPoints += 3;
  }

  async performRomance(npc) {
    const target = this.getRandomTarget(npc.id);
    if (!target) return;
    await this.interactionEngine.performSocialAction(npc.id, 'compliment', target.id, {
      message: 'No puedo dejar de pensar en ti.'
    });
    this.emitSpeech(npc.id, npc.name, `${target.name}, ¿quieres tomar un café conmigo?`);
    metrics.npc.dramaPoints += 5;
  }

  pickPlaceName() {
    const places = ['Hobbs Café', 'Market Square', 'Central Plaza', 'City Hall'];
    return places[Math.floor(Math.random() * places.length)];
  }
}

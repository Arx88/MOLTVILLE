import fs from 'node:fs';
import { io } from 'socket.io-client';

const DEFAULTS = {
  heartbeatMs: 5000,
  speakChance: 0.2,
  wanderChance: 0.4,
  voteCooldownMs: 5 * 60 * 1000,
  proposeCooldownMs: 15 * 60 * 1000,
  governanceCooldownMs: 10 * 60 * 1000,
  aestheticsCooldownMs: 10 * 60 * 1000,
  socialCooldownMs: 45 * 1000,
  propertyCooldownMs: 20 * 60 * 1000
};

export class MoltbotClient {
  constructor({
    apiBase = process.env.MOLTVILLE_API_BASE || 'http://localhost:3001',
    socketUrl = process.env.MOLTVILLE_SOCKET || 'http://localhost:3001',
    apiKey = process.env.MOLTVILLE_API_KEY,
    agentId = process.env.MOLTBOT_ID || null,
    agentName = process.env.MOLTBOT_NAME || 'Moltbot',
    avatar = 'char1',
    heartbeatMs = Number(process.env.MOLTBOT_HEARTBEAT_MS) || DEFAULTS.heartbeatMs,
    personality = {},
    memoryPath = process.env.MOLTBOT_MEMORY_PATH || null,
    logger = console
  } = {}) {
    if (!apiKey) {
      throw new Error('MOLTVILLE_API_KEY is required');
    }
    if (!agentName) {
      throw new Error('MOLTBOT_NAME is required');
    }
    this.apiBase = apiBase;
    this.socketUrl = socketUrl;
    this.apiKey = apiKey;
    this.agentId = agentId;
    this.agentName = agentName;
    this.avatar = avatar;
    this.heartbeatMs = heartbeatMs;
    this.personality = personality;
    this.memoryPath = memoryPath;
    this.logger = logger;

    this.socket = null;
    this.lastPerception = null;
    this.catalog = null;
    this.state = this.loadMemory();
    this.lastHeartbeatAt = 0;
    this.running = false;
  }

  connect() {
    this.socket = io(this.socketUrl, { transports: ['websocket'] });
    this.socket.on('connect', () => {
      this.logger.info('[moltbot] socket connected');
      this.socket.emit('agent:connect', {
        apiKey: this.apiKey,
        agentId: this.agentId,
        agentName: this.agentName,
        avatar: this.avatar
      });
    });

    this.socket.on('agent:registered', (payload) => {
      this.agentId = payload.agentId;
      this.lastPerception = payload.worldState || null;
      this.logger.info(`[moltbot] registered as ${this.agentId}`);
    });

    this.socket.on('perception:update', (payload) => {
      this.lastPerception = payload;
    });

    this.socket.on('auth:rotated', (payload) => {
      if (payload?.apiKey) {
        this.apiKey = payload.apiKey;
        this.logger.info('[moltbot] API key rotated');
      }
    });

    this.socket.on('error', (err) => {
      this.logger.warn('[moltbot] socket error', err);
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.connect();
    this._heartbeatLoop();
  }

  stop() {
    this.running = false;
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  async _heartbeatLoop() {
    while (this.running) {
      const now = Date.now();
      if (now - this.lastHeartbeatAt >= this.heartbeatMs) {
        this.lastHeartbeatAt = now;
        await this.tick();
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  async tick() {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('agent:perceive', {});

    const perception = this.lastPerception;
    if (!perception) return;

    await this.maybeVote();
    await this.maybeProposeBuilding();
    await this.maybeGovernance();
    await this.maybeAesthetics();
    await this.maybeWork(perception);
    await this.maybeProperty(perception);
    await this.maybeSocial(perception);

    const decision = this.decide(perception);
    await this.act(decision, perception);
    this.persistMemory();
  }

  decide(perception) {
    const { suggestedGoals = [], nearbyBuildings = [] } = perception;
    if (suggestedGoals.length) {
      const goal = suggestedGoals[0];
      const target = nearbyBuildings.find(building =>
        goal.targetTypes?.includes(building.type)
      );
      if (target) {
        return { type: 'move', target: { x: target.position.x, y: target.position.y }, reason: goal.reason };
      }
      return { type: 'wander', reason: goal.reason };
    }

    if (Math.random() < DEFAULTS.speakChance) {
      return { type: 'speak', message: this.pickLine() };
    }

    if (Math.random() < DEFAULTS.wanderChance) {
      return { type: 'wander' };
    }

    return { type: 'idle' };
  }

  async act(decision, perception) {
    switch (decision.type) {
      case 'move':
        this.socket.emit('agent:moveTo', decision.target);
        break;
      case 'wander':
        this.socket.emit('agent:moveTo', this.randomNearby(perception?.position));
        break;
      case 'speak':
        this.socket.emit('agent:speak', { message: decision.message });
        break;
      case 'idle':
      default:
        break;
    }
  }

  async maybeVote() {
    try {
      if (!this.isCooldownReady('vote', DEFAULTS.voteCooldownMs)) return;
      const voteRes = await fetch(`${this.apiBase}/api/vote/current`);
      const { vote } = await voteRes.json();
      if (!vote || vote.id === this.state.lastVoteId) return;

      const option = vote.options[Math.floor(Math.random() * vote.options.length)];
      await fetch(`${this.apiBase}/api/vote/cast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: this.agentId, optionId: option.id })
      });
      this.state.lastVoteId = vote.id;
      this.markCooldown('vote');
      this.logger.info('[moltbot] voted in building election');
    } catch (error) {
      this.logger.warn('[moltbot] vote failed', error.message);
    }
  }

  async maybeProposeBuilding() {
    if (!this.isCooldownReady('proposal', DEFAULTS.proposeCooldownMs)) return;
    try {
      if (!this.catalog) {
        const catalogRes = await fetch(`${this.apiBase}/api/vote/catalog`);
        const data = await catalogRes.json();
        this.catalog = data.catalog || [];
      }
      if (!this.catalog.length) return;
      if (Math.random() > 0.2) return;
      const candidate = this.catalog[Math.floor(Math.random() * this.catalog.length)];
      const customName = `${candidate.name} ${Math.floor(Math.random() * 90 + 10)}`;
      await fetch(`${this.apiBase}/api/vote/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: this.agentId,
          templateId: candidate.id,
          customName
        })
      });
      this.markCooldown('proposal');
      this.logger.info('[moltbot] proposed building', candidate.name);
    } catch (error) {
      this.logger.warn('[moltbot] proposal failed', error.message);
    }
  }

  async maybeGovernance() {
    if (!this.isCooldownReady('governance', DEFAULTS.governanceCooldownMs)) return;
    try {
      const res = await fetch(`${this.apiBase}/api/governance/current`);
      const summary = await res.json();
      const election = summary?.election;
      if (!election || election.id === this.state.lastElectionId) {
        this.markCooldown('governance');
        return;
      }
      const candidates = election.candidates || [];
      if (!candidates.length && Math.random() < 0.3) {
        await fetch(`${this.apiBase}/api/governance/candidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: this.agentId,
            name: this.agentName,
            platform: this.personality?.platform || 'Crecimiento sostenible y comunidad.'
          })
        });
        this.logger.info('[moltbot] registered as candidate');
      } else if (candidates.length) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        await fetch(`${this.apiBase}/api/governance/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: this.agentId, candidateId: pick.agentId })
        });
        this.logger.info('[moltbot] voted in governance election');
      }
      this.state.lastElectionId = election.id;
      this.markCooldown('governance');
    } catch (error) {
      this.logger.warn('[moltbot] governance failed', error.message);
    }
  }

  async maybeAesthetics() {
    if (!this.isCooldownReady('aesthetics', DEFAULTS.aestheticsCooldownMs)) return;
    try {
      const res = await fetch(`${this.apiBase}/api/aesthetics/current`);
      const { vote } = await res.json();
      if (!vote || vote.id === this.state.lastAestheticsVoteId) return;
      const option = vote.options[Math.floor(Math.random() * vote.options.length)];
      await fetch(`${this.apiBase}/api/aesthetics/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: this.agentId, optionId: option.id })
      });
      this.state.lastAestheticsVoteId = vote.id;
      this.markCooldown('aesthetics');
      this.logger.info('[moltbot] voted on aesthetics');
    } catch (error) {
      this.logger.warn('[moltbot] aesthetics vote failed', error.message);
    }
  }

  async maybeWork(perception) {
    if (!this.agentId) return;
    try {
      const jobsRes = await fetch(`${this.apiBase}/api/economy/jobs`);
      const { jobs } = await jobsRes.json();
      const available = (jobs || []).filter(job => !job.assignedTo);
      if (!available.length) return;
      if (Math.random() > 0.3) return;
      const target = available[Math.floor(Math.random() * available.length)];
      await fetch(`${this.apiBase}/api/economy/jobs/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify({ agentId: this.agentId, jobId: target.id })
      });
      this.logger.info('[moltbot] applied for job', target.role);
    } catch (error) {
      this.logger.warn('[moltbot] job apply failed', error.message);
    }
  }

  async maybeProperty() {
    if (!this.agentId || !this.isCooldownReady('property', DEFAULTS.propertyCooldownMs)) return;
    try {
      const propertiesRes = await fetch(`${this.apiBase}/api/economy/properties`);
      const { properties } = await propertiesRes.json();
      const available = (properties || []).filter(prop => prop.forSale);
      if (!available.length) return;
      const candidate = available[Math.floor(Math.random() * available.length)];
      await fetch(`${this.apiBase}/api/economy/properties/buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify({ agentId: this.agentId, propertyId: candidate.id })
      });
      this.markCooldown('property');
      this.logger.info('[moltbot] attempted property purchase', candidate.name);
    } catch (error) {
      this.logger.warn('[moltbot] property purchase failed', error.message);
    }
  }

  async maybeSocial(perception) {
    if (!this.isCooldownReady('social', DEFAULTS.socialCooldownMs)) return;
    const nearby = perception?.nearbyAgents || [];
    if (!nearby.length || Math.random() > 0.35) return;
    const target = nearby[Math.floor(Math.random() * nearby.length)];
    const actions = ['wave', 'compliment', 'gift'];
    const actionType = actions[Math.floor(Math.random() * actions.length)];
    this.socket.emit('agent:social', {
      actionType,
      targetId: target.id,
      data: { message: this.pickLine(), item: 'Flor' }
    });
    this.markCooldown('social');
  }

  randomNearby(position = { x: 12, y: 12 }) {
    const dx = Math.floor(Math.random() * 7) - 3;
    const dy = Math.floor(Math.random() * 7) - 3;
    return { x: position.x + dx, y: position.y + dy };
  }

  pickLine() {
    const lines = this.personality?.lines || [
      'Hola, vecinos. ¿Cómo va la ciudad?',
      'Estoy explorando nuevas rutas hoy.',
      'La plaza está llena de vida.',
      'El mercado tiene buenas vibras.',
      'Me gusta cómo crece Moltville.'
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  isCooldownReady(key, cooldownMs) {
    const last = this.state?.cooldowns?.[key] || 0;
    return Date.now() - last >= cooldownMs;
  }

  markCooldown(key) {
    if (!this.state.cooldowns) this.state.cooldowns = {};
    this.state.cooldowns[key] = Date.now();
  }

  loadMemory() {
    if (!this.memoryPath) return { cooldowns: {} };
    try {
      const raw = fs.readFileSync(this.memoryPath, 'utf-8');
      return JSON.parse(raw);
    } catch (error) {
      return { cooldowns: {} };
    }
  }

  persistMemory() {
    if (!this.memoryPath) return;
    try {
      fs.writeFileSync(this.memoryPath, JSON.stringify(this.state, null, 2));
    } catch (error) {
      this.logger.warn('[moltbot] memory persist failed', error.message);
    }
  }
}

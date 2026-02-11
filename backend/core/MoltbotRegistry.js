import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { normalizePermissions } from '../utils/permissions.js';
import fs from 'fs';
import path from 'path';

export class MoltbotRegistry {
  constructor(options = {}) {
    this.db = options.db || null;
    this.agents = new Map(); // agentId -> agent data
    this.apiKeys = new Map(); // apiKey -> agentId
    this.sockets = new Map(); // agentId -> socketId
    this.issuedApiKeys = new Set();
    this.apiKeyEvents = [];
    this.apiKeyStorePath = options.apiKeyStorePath || path.resolve(process.cwd(), 'data', 'api-keys.json');
    if (!this.db) {
      this.loadApiKeysFromDisk();
    }
    this.memoryLimits = {
      interactionsMax: parseInt(process.env.MEMORY_INTERACTIONS_MAX, 10) || 200,
      locationsMax: parseInt(process.env.MEMORY_LOCATIONS_MAX, 10) || 100,
      maxAgeMs: parseInt(process.env.MEMORY_MAX_AGE_MS, 10) || 7 * 24 * 60 * 60 * 1000,
      pruneIntervalMs: parseInt(process.env.MEMORY_PRUNE_INTERVAL_MS, 10) || 600000
    };
    this.lastMemoryPrune = 0;
  }

  async initializeFromDb() {
    if (!this.db) return;
    const result = await this.db.query(
      'SELECT api_key FROM api_keys WHERE revoked_at IS NULL'
    );
    result.rows.forEach(row => this.issuedApiKeys.add(row.api_key));
  }

  async issueApiKey(apiKey, options = {}) {
    this.issuedApiKeys.add(apiKey);
    this.persistApiKey(apiKey);
    this.recordApiKeyEvent('issued', apiKey, options);
    this.persistApiKeysToDisk();
  }

  revokeApiKey(apiKey, options = {}) {
    if (!apiKey) return;
    this.issuedApiKeys.delete(apiKey);
    this.apiKeys.delete(apiKey);
    this.persistApiKeyRevocation(apiKey);
    this.recordApiKeyEvent('revoked', apiKey, options);
    this.persistApiKeysToDisk();
  }

  async rotateApiKey(oldKey, newKey, options = {}) {
    if (!oldKey || !newKey) return null;
    if (!this.issuedApiKeys.has(oldKey)) return null;
    const baseMetadata = options.metadata && typeof options.metadata === 'object'
      ? options.metadata
      : {};
    const agentId = this.apiKeys.get(oldKey) || null;
    if (agentId) {
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.apiKey = newKey;
      }
    }
    this.apiKeys.delete(oldKey);
    if (agentId) {
      this.apiKeys.set(newKey, agentId);
    }
    await this.issueApiKey(newKey, options);
    this.revokeApiKey(oldKey, {
      ...options,
      metadata: {
        ...baseMetadata,
        rotatedTo: newKey
      }
    });
    if (this.db && agentId) {
      await this.assignApiKeyToAgent(newKey, agentId);
    }
    this.recordApiKeyEvent('rotated', oldKey, {
      ...options,
      metadata: {
        ...baseMetadata,
        newKey
      }
    });
    return { agentId };
  }

  isApiKeyIssued(apiKey) {
    return this.issuedApiKeys.has(apiKey);
  }

  async registerAgent(data) {
    const { id, name, avatar, socketId, apiKey, permissions, isNPC = false, connected = true } = data;
    const normalizedPermissions = permissions ? normalizePermissions(permissions) : null;

    // Check if already registered
    if (this.agents.has(id)) {
      // Update socket if reconnecting
      const existing = this.agents.get(id);
      if (existing.apiKey && existing.apiKey !== apiKey) {
        throw new Error('API key mismatch for agent');
      }
      existing.socketId = socketId;
      existing.lastSeen = Date.now();
      existing.connected = connected;
      if (normalizedPermissions) {
        existing.permissions = normalizedPermissions;
        this.persistPermissions(existing.id, normalizedPermissions);
      }
      if (data.profile) existing.profile = data.profile;
      if (data.traits) existing.traits = data.traits;
      if (data.motivation) existing.motivation = data.motivation;
      if (data.plan) existing.plan = data.plan;
      if (data.cognition) existing.cognition = data.cognition;
      existing.isNPC = isNPC;
      this.sockets.set(id, socketId);
      if (this.db && !existing.memory.loadedFromDb) {
        await this.loadAgentState(existing.id);
      }
      logger.info(`Agent ${name} reconnected`);
      return existing;
    }

    // Create new agent
    const agent = {
      id: id || uuidv4(),
      name,
      avatar,
      socketId,
      apiKey,
      permissions: normalizedPermissions || normalizePermissions(),
      connected,
      connectedAt: Date.now(),
      lastSeen: Date.now(),
      isNPC,
      stats: {
        messagesSent: 0,
        actionsTaken: 0,
        interactionCount: 0
      },
      profile: data.profile || null,
      traits: data.traits || null,
      motivation: data.motivation || null,
      plan: data.plan || null,
      cognition: data.cognition || null,
      memory: {
        interactions: [],
        locations: [],
        relationships: {},
        favorites: {
          personId: null,
          locationId: null
        },
        locationStats: {}
      }
    };

    this.agents.set(agent.id, agent);
    this.apiKeys.set(apiKey, agent.id);
    this.sockets.set(agent.id, socketId);

    if (this.db) {
      await this.loadAgentState(agent.id);
      this.persistPermissions(agent.id, agent.permissions);
      await this.assignApiKeyToAgent(apiKey, agent.id);
    }

    logger.info(`Agent registered: ${name} (${agent.id})`);
    return agent;
  }

  async loadAgentState(agentId) {
    if (!this.db) return;
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const [relationshipsResult, memoriesResult, permissionsResult] = await Promise.all([
      this.db.query(
        'SELECT * FROM agent_relationships WHERE agent_id = $1',
        [agentId]
      ),
      this.db.query(
        'SELECT type, data, timestamp FROM agent_memories WHERE agent_id = $1 ORDER BY timestamp ASC',
        [agentId]
      ),
      this.db.query(
        'SELECT permissions FROM agent_permissions WHERE agent_id = $1',
        [agentId]
      )
    ]);

    relationshipsResult.rows.forEach(row => {
      agent.memory.relationships[row.other_agent_id] = {
        affinity: row.affinity,
        trust: row.trust,
        respect: row.respect,
        conflict: row.conflict,
        interactions: row.interactions,
        lastInteraction: row.last_interaction
      };
    });

    memoriesResult.rows.forEach(row => {
      agent.memory.interactions.push({
        type: row.type,
        data: row.data,
        timestamp: Number(row.timestamp)
      });
    });

    if (permissionsResult.rows.length) {
      agent.permissions = normalizePermissions(permissionsResult.rows[0].permissions);
    }

    agent.memory.loadedFromDb = true;
  }

  unregisterAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.apiKeys.delete(agent.apiKey);
      this.sockets.delete(agentId);
      this.agents.delete(agentId);
      logger.info(`Agent unregistered: ${agent.name} (${agentId})`);
    }
  }

  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  getAgentByApiKey(apiKey) {
    const agentId = this.apiKeys.get(apiKey);
    return agentId ? this.agents.get(agentId) : null;
  }

  getAgentSocket(agentId) {
    return this.sockets.get(agentId);
  }

  getAllAgents() {
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      connected: agent.connected,
      connectedAt: agent.connectedAt,
      lastSeen: agent.lastSeen,
      stats: agent.stats,
      permissions: agent.permissions || [],
      isNPC: Boolean(agent.isNPC),
      profile: agent.profile || null,
      traits: agent.traits || null,
      motivation: agent.motivation || null,
      plan: agent.plan || null,
      cognition: agent.cognition || null,
      relationshipCount: Object.keys(agent.memory?.relationships || {}).length
    }));
  }

  getAgentCount() {
    return this.agents.size;
  }

  updateAgentProfile(agentId, payload = {}) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    if (payload.profile) agent.profile = payload.profile;
    if (payload.traits) agent.traits = payload.traits;
    if (payload.motivation) agent.motivation = payload.motivation;
    if (payload.plan) agent.plan = payload.plan;
    if (payload.cognition) agent.cognition = payload.cognition;
    agent.lastSeen = Date.now();
    return agent;
  }

  updateAgentActivity(agentId, activityType) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastSeen = Date.now();
      
      switch (activityType) {
        case 'message':
          agent.stats.messagesSent++;
          break;
        case 'action':
          agent.stats.actionsTaken++;
          break;
        case 'interaction':
          agent.stats.interactionCount++;
          break;
      }
    }
  }

  setAgentConnection(agentId, connected) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.connected = connected;
      agent.lastSeen = Date.now();
    }
  }

  addMemory(agentId, memoryType, data) {
    const agent = this.agents.get(agentId);
    if (agent) {
      const memory = {
        type: memoryType,
        data,
        timestamp: Date.now()
      };

      switch (memoryType) {
        case 'interaction':
          agent.memory.interactions.push(memory);
          this.trimMemoryList(agent.memory.interactions, this.memoryLimits.interactionsMax);
          break;
        case 'location':
          agent.memory.locations.push(memory);
          this.trimMemoryList(agent.memory.locations, this.memoryLimits.locationsMax);
          this.updateFavoriteLocation(agent, data);
          break;
      }

      this.persistMemory(agentId, memory);
    }
  }

  trimMemoryList(list, max) {
    if (max <= 0) return;
    if (list.length > max) {
      list.splice(0, list.length - max);
    }
  }

  pruneMemories() {
    const now = Date.now();
    if (now - this.lastMemoryPrune < this.memoryLimits.pruneIntervalMs) return;
    this.lastMemoryPrune = now;
    const maxAgeMs = this.memoryLimits.maxAgeMs;
    const pruneByAge = Number.isFinite(maxAgeMs) && maxAgeMs > 0;

    this.agents.forEach(agent => {
      if (pruneByAge) {
        agent.memory.interactions = agent.memory.interactions.filter(
          entry => now - entry.timestamp <= maxAgeMs
        );
        agent.memory.locations = agent.memory.locations.filter(
          entry => now - entry.timestamp <= maxAgeMs
        );
      }
      this.trimMemoryList(agent.memory.interactions, this.memoryLimits.interactionsMax);
      this.trimMemoryList(agent.memory.locations, this.memoryLimits.locationsMax);
    });
  }

  updateRelationship(agentId, otherAgentId, delta, dimensions = {}) {
    const agent = this.agents.get(agentId);
    if (agent) {
      if (!agent.memory.relationships[otherAgentId]) {
        agent.memory.relationships[otherAgentId] = {
          affinity: 0,
          trust: 0,
          respect: 0,
          conflict: 0,
          interactions: 0,
          lastInteraction: null
        };
      }
      
      const rel = agent.memory.relationships[otherAgentId];
      const affinityDelta = typeof delta === 'number' ? delta : (delta.affinity || 0);
      const trustDelta = dimensions.trust || 0;
      const respectDelta = dimensions.respect || 0;
      const conflictDelta = dimensions.conflict || 0;

      rel.affinity = this.clamp(rel.affinity + affinityDelta, -100, 100);
      rel.trust = this.clamp(rel.trust + trustDelta, -100, 100);
      rel.respect = this.clamp(rel.respect + respectDelta, -100, 100);
      rel.conflict = this.clamp(rel.conflict + conflictDelta, 0, 100);
      rel.interactions++;
      rel.lastInteraction = Date.now();

      this.persistRelationship(agentId, otherAgentId, rel);
      this.updateFavoritePerson(agent, otherAgentId);
    }
  }

  updateFavoriteLocation(agent, data = {}) {
    if (!agent || !data) return;
    const buildingId = data.buildingId || data.building || null;
    if (!buildingId) return;
    if (!agent.memory.locationStats) {
      agent.memory.locationStats = {};
    }
    const stats = agent.memory.locationStats;
    stats[buildingId] = (stats[buildingId] || 0) + 1;
    const currentFavorite = agent.memory.favorites?.locationId || null;
    const favoriteCount = currentFavorite ? (stats[currentFavorite] || 0) : 0;
    if (!currentFavorite || stats[buildingId] > favoriteCount) {
      agent.memory.favorites.locationId = buildingId;
    }
  }

  updateFavoritePerson(agent, otherAgentId) {
    if (!agent || !otherAgentId) return;
    const relationships = agent.memory.relationships || {};
    const candidate = relationships[otherAgentId];
    if (!candidate) return;
    const currentFavorite = agent.memory.favorites?.personId || null;
    const currentRel = currentFavorite ? relationships[currentFavorite] : null;
    const candidateScore = this.getRelationshipScore(candidate);
    const currentScore = currentRel ? this.getRelationshipScore(currentRel) : -Infinity;
    if (!currentFavorite || candidateScore > currentScore) {
      agent.memory.favorites.personId = otherAgentId;
    }
  }

  getRelationshipScore(rel) {
    if (!rel) return 0;
    return (rel.affinity || 0) + (rel.trust || 0) + (rel.respect || 0) - (rel.conflict || 0);
  }

  getRelationshipEmotions(rel) {
    if (!rel) return [];
    const emotions = [];
    if (rel.affinity >= 60 && rel.trust >= 40 && rel.conflict <= 30) {
      emotions.push('love');
    }
    if (rel.conflict >= 60 && rel.respect <= 20) {
      emotions.push('hate');
    }
    if (rel.respect >= 50 && rel.affinity < 20 && rel.conflict < 50) {
      emotions.push('envy');
    }
    if (!emotions.length) {
      emotions.push(rel.affinity >= 20 ? 'friendly' : 'neutral');
    }
    return emotions;
  }

  getAgentMemory(agentId, memoryType = null, limit = 10) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    if (memoryType) {
      const memories = agent.memory[memoryType] || [];
      return memories.slice(-limit);
    }

    return {
      interactions: agent.memory.interactions.slice(-limit),
      locations: agent.memory.locations.slice(-limit),
      relationships: agent.memory.relationships,
      relationshipsWithEmotions: this.getRelationshipSummaries(agentId),
      favorites: agent.memory.favorites || { personId: null, locationId: null },
      locationStats: agent.memory.locationStats || {}
    };
  }

  getRelationshipSummaries(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return {};
    return Object.entries(agent.memory.relationships || {}).reduce((acc, [otherId, rel]) => {
      acc[otherId] = {
        ...rel,
        emotions: this.getRelationshipEmotions(rel)
      };
      return acc;
    }, {});
  }

  getRelationship(agentId, otherAgentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    const rel = agent.memory.relationships[otherAgentId] || {
      affinity: 0,
      trust: 0,
      respect: 0,
      conflict: 0,
      interactions: 0,
      lastInteraction: null
    };
    return {
      ...rel,
      emotions: this.getRelationshipEmotions(rel)
    };
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  persistRelationship(agentId, otherAgentId, rel) {
    if (!this.db) return;
    this.db.query(
      `INSERT INTO agent_relationships
        (agent_id, other_agent_id, affinity, trust, respect, conflict, interactions, last_interaction)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (agent_id, other_agent_id) DO UPDATE SET
        affinity = EXCLUDED.affinity,
        trust = EXCLUDED.trust,
        respect = EXCLUDED.respect,
        conflict = EXCLUDED.conflict,
        interactions = EXCLUDED.interactions,
        last_interaction = EXCLUDED.last_interaction`,
      [
        agentId,
        otherAgentId,
        rel.affinity,
        rel.trust,
        rel.respect,
        rel.conflict,
        rel.interactions,
        rel.lastInteraction
      ]
    ).catch(error => logger.error('Relationship persist failed:', error));
  }

  persistMemory(agentId, memory) {
    if (!this.db) return;
    this.db.query(
      'INSERT INTO agent_memories (agent_id, type, data, timestamp) VALUES ($1, $2, $3, $4)',
      [agentId, memory.type, memory.data, memory.timestamp]
    ).catch(error => logger.error('Memory persist failed:', error));
  }

  persistPermissions(agentId, permissions) {
    if (!this.db) return;
    this.db.query(
      `INSERT INTO agent_permissions (agent_id, permissions)
       VALUES ($1, $2)
       ON CONFLICT (agent_id) DO UPDATE SET permissions = EXCLUDED.permissions`,
      [agentId, JSON.stringify(permissions || [])]
    ).catch(error => logger.error('Permissions persist failed:', error));
  }

  setAgentPermissions(agentId, permissions) {
    const agent = this.agents.get(agentId);
    const normalized = normalizePermissions(permissions);
    if (agent) {
      agent.permissions = normalized;
      this.persistPermissions(agentId, normalized);
    }
    return normalized;
  }

  createSnapshot() {
    return {
      issuedApiKeys: Array.from(this.issuedApiKeys),
      apiKeyEvents: this.apiKeyEvents.map(event => ({ ...event })),
      agents: Array.from(this.agents.values()).map(agent => ({
        id: agent.id,
        name: agent.name,
        avatar: agent.avatar,
        apiKey: agent.apiKey,
        permissions: agent.permissions || [],
        connectedAt: agent.connectedAt,
        lastSeen: agent.lastSeen,
        isNPC: Boolean(agent.isNPC),
        stats: { ...agent.stats },
        profile: agent.profile || null,
        traits: agent.traits || null,
        motivation: agent.motivation || null,
        plan: agent.plan || null,
        cognition: agent.cognition || null,
        memory: {
          interactions: agent.memory.interactions.map(entry => ({ ...entry })),
          locations: agent.memory.locations.map(entry => ({ ...entry })),
          relationships: { ...agent.memory.relationships },
          favorites: agent.memory.favorites ? { ...agent.memory.favorites } : { personId: null, locationId: null },
          locationStats: agent.memory.locationStats ? { ...agent.memory.locationStats } : {}
        }
      }))
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot) return;
    this.issuedApiKeys = new Set(snapshot.issuedApiKeys || []);
    this.apiKeyEvents = Array.isArray(snapshot.apiKeyEvents)
      ? snapshot.apiKeyEvents.map(event => ({ ...event }))
      : [];

    this.agents = new Map();
    this.apiKeys = new Map();
    this.sockets = new Map();
    (snapshot.agents || []).forEach(agent => {
      if (!agent || !agent.id) return;
      const restored = {
        id: agent.id,
        name: agent.name,
        avatar: agent.avatar,
        socketId: null,
        apiKey: agent.apiKey,
        permissions: normalizePermissions(agent.permissions),
        connected: false,
        connectedAt: agent.connectedAt || null,
        lastSeen: agent.lastSeen || null,
        isNPC: Boolean(agent.isNPC),
        stats: agent.stats ? { ...agent.stats } : { messagesSent: 0, actionsTaken: 0, interactionCount: 0 },
        profile: agent.profile || null,
        traits: agent.traits || null,
        motivation: agent.motivation || null,
        plan: agent.plan || null,
        cognition: agent.cognition || null,
        memory: {
          interactions: Array.isArray(agent.memory?.interactions) ? agent.memory.interactions.map(entry => ({ ...entry })) : [],
          locations: Array.isArray(agent.memory?.locations) ? agent.memory.locations.map(entry => ({ ...entry })) : [],
          relationships: agent.memory?.relationships ? { ...agent.memory.relationships } : {},
          favorites: agent.memory?.favorites ? { ...agent.memory.favorites } : { personId: null, locationId: null },
          locationStats: agent.memory?.locationStats ? { ...agent.memory.locationStats } : {},
          loadedFromDb: true
        }
      };
      this.agents.set(restored.id, restored);
      if (restored.apiKey) {
        this.apiKeys.set(restored.apiKey, restored.id);
      }
    });
  }

  loadApiKeysFromDisk() {
    try {
      if (!fs.existsSync(this.apiKeyStorePath)) return;
      const raw = fs.readFileSync(this.apiKeyStorePath, 'utf8');
      const parsed = JSON.parse(raw);
      const issued = Array.isArray(parsed?.issuedApiKeys) ? parsed.issuedApiKeys : [];
      this.issuedApiKeys = new Set(issued);
      const events = Array.isArray(parsed?.apiKeyEvents) ? parsed.apiKeyEvents : [];
      this.apiKeyEvents = events.map(event => ({ ...event }));
    } catch (error) {
      logger.error('Failed to load API keys from disk:', error);
    }
  }

  persistApiKeysToDisk() {
    if (this.db) return;
    try {
      const dir = path.dirname(this.apiKeyStorePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const payload = {
        issuedApiKeys: Array.from(this.issuedApiKeys),
        apiKeyEvents: this.apiKeyEvents.slice(-200)
      };
      fs.writeFileSync(this.apiKeyStorePath, JSON.stringify(payload, null, 2));
    } catch (error) {
      logger.error('Failed to persist API keys to disk:', error);
    }
  }

  persistApiKey(apiKey) {
    if (!this.db) return;
    this.db.query(
      `INSERT INTO api_keys (api_key)
       VALUES ($1)
       ON CONFLICT (api_key) DO UPDATE SET revoked_at = NULL`,
      [apiKey]
    ).catch(error => logger.error('API key persist failed:', error));
  }

  persistApiKeyRevocation(apiKey) {
    if (!this.db) return;
    this.db.query(
      'UPDATE api_keys SET revoked_at = NOW() WHERE api_key = $1',
      [apiKey]
    ).catch(error => logger.error('API key revocation failed:', error));
  }

  async assignApiKeyToAgent(apiKey, agentId) {
    if (!this.db) return;
    await this.db.query(
      'UPDATE api_keys SET agent_id = $2 WHERE api_key = $1',
      [apiKey, agentId]
    );
  }

  isAgentOnline(agentId) {
    return this.agents.has(agentId);
  }

  getOnlineAgentIds() {
    return Array.from(this.agents.keys());
  }

  async listApiKeys() {
    if (this.db) {
      const result = await this.db.query(
        'SELECT api_key, agent_id, issued_at, revoked_at FROM api_keys ORDER BY issued_at DESC'
      );
      return result.rows.map(row => {
        const agent = row.agent_id ? this.getAgent(row.agent_id) : null;
        return {
          apiKey: row.api_key,
          agentId: row.agent_id,
          agentName: agent?.name || null,
          issuedAt: row.issued_at,
          revokedAt: row.revoked_at,
          status: row.revoked_at ? 'revoked' : 'active'
        };
      });
    }

    return Array.from(this.issuedApiKeys).map(apiKey => {
      const agent = this.getAgentByApiKey(apiKey);
      return {
        apiKey,
        agentId: agent?.id || null,
        agentName: agent?.name || null,
        issuedAt: null,
        revokedAt: null,
        status: 'active'
      };
    });
  }

  async listApiKeyEvents(limit = 50) {
    if (this.db) {
      const result = await this.db.query(
        `SELECT api_key, action, actor_id, actor_type, metadata, created_at
         FROM api_key_events
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );
      return result.rows.map(row => ({
        apiKey: row.api_key,
        action: row.action,
        actorId: row.actor_id,
        actorType: row.actor_type,
        metadata: row.metadata,
        createdAt: row.created_at
      }));
    }

    return this.apiKeyEvents.slice(-limit).reverse();
  }

  recordApiKeyEvent(action, apiKey, options = {}) {
    if (!apiKey) return;
    const { actorId = null, actorType = null, metadata = null } = options;
    const event = {
      apiKey,
      action,
      actorId,
      actorType,
      metadata,
      createdAt: new Date()
    };
    this.apiKeyEvents.push(event);
    if (this.apiKeyEvents.length > 200) {
      this.apiKeyEvents.shift();
    }
    if (!this.db) {
      this.persistApiKeysToDisk();
      return;
    }
    this.db.query(
      `INSERT INTO api_key_events (api_key, action, actor_id, actor_type, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [apiKey, action, actorId, actorType, metadata]
    ).catch(error => logger.error('API key event persist failed:', error));
  }
}

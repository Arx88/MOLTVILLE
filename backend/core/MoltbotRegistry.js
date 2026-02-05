import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

export class MoltbotRegistry {
  constructor(options = {}) {
    this.db = options.db || null;
    this.agents = new Map(); // agentId -> agent data
    this.apiKeys = new Map(); // apiKey -> agentId
    this.sockets = new Map(); // agentId -> socketId
    this.issuedApiKeys = new Set();
  }

  async initializeFromDb() {
    if (!this.db) return;
    const result = await this.db.query(
      'SELECT api_key FROM api_keys WHERE revoked_at IS NULL'
    );
    result.rows.forEach(row => this.issuedApiKeys.add(row.api_key));
  }

  async issueApiKey(apiKey) {
    this.issuedApiKeys.add(apiKey);
    this.persistApiKey(apiKey);
  }

  revokeApiKey(apiKey) {
    if (!apiKey) return;
    this.issuedApiKeys.delete(apiKey);
    this.apiKeys.delete(apiKey);
    this.persistApiKeyRevocation(apiKey);
  }

  async rotateApiKey(oldKey, newKey) {
    if (!oldKey || !newKey) return null;
    if (!this.issuedApiKeys.has(oldKey)) return null;
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
    await this.issueApiKey(newKey);
    this.revokeApiKey(oldKey);
    if (this.db && agentId) {
      await this.assignApiKeyToAgent(newKey, agentId);
    }
    return { agentId };
  }

  isApiKeyIssued(apiKey) {
    return this.issuedApiKeys.has(apiKey);
  }

  getIssuedKeys() {
    return Array.from(this.issuedApiKeys).map(apiKey => ({
      apiKey,
      agentId: this.apiKeys.get(apiKey) || null
    }));
  }

  async registerAgent(data) {
    const { id, name, avatar, socketId, apiKey } = data;

    // Check if already registered
    if (this.agents.has(id)) {
      // Update socket if reconnecting
      const existing = this.agents.get(id);
      if (existing.apiKey && existing.apiKey !== apiKey) {
        throw new Error('API key mismatch for agent');
      }
      existing.socketId = socketId;
      existing.lastSeen = Date.now();
      existing.connected = true;
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
      connected: true,
      connectedAt: Date.now(),
      lastSeen: Date.now(),
      stats: {
        messagesSent: 0,
        actionsTaken: 0,
        interactionCount: 0
      },
      memory: {
        interactions: [],
        locations: [],
        relationships: {}
      }
    };

    this.agents.set(agent.id, agent);
    this.apiKeys.set(apiKey, agent.id);
    this.sockets.set(agent.id, socketId);

    if (this.db) {
      await this.loadAgentState(agent.id);
      await this.assignApiKeyToAgent(apiKey, agent.id);
    }

    logger.info(`Agent registered: ${name} (${agent.id})`);
    return agent;
  }

  async loadAgentState(agentId) {
    if (!this.db) return;
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const [relationshipsResult, memoriesResult] = await Promise.all([
      this.db.query(
        'SELECT * FROM agent_relationships WHERE agent_id = $1',
        [agentId]
      ),
      this.db.query(
        'SELECT type, data, timestamp FROM agent_memories WHERE agent_id = $1 ORDER BY timestamp ASC',
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
      stats: agent.stats
    }));
  }

  getPublicAgents() {
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      connected: agent.connected,
      lastSeen: agent.lastSeen
    }));
  }

  getAgentCount() {
    return this.agents.size;
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
          // Keep last 100 interactions
          if (agent.memory.interactions.length > 100) {
            agent.memory.interactions.shift();
          }
          break;
        case 'location':
          agent.memory.locations.push(memory);
          if (agent.memory.locations.length > 50) {
            agent.memory.locations.shift();
          }
          break;
      }

      this.persistMemory(agentId, memory);
    }
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
    }
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
      relationships: agent.memory.relationships
    };
  }

  getRelationship(agentId, otherAgentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    return agent.memory.relationships[otherAgentId] || {
      affinity: 0,
      trust: 0,
      respect: 0,
      conflict: 0,
      interactions: 0,
      lastInteraction: null
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
}

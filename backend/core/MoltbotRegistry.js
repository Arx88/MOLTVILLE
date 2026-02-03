import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

export class MoltbotRegistry {
  constructor() {
    this.agents = new Map(); // agentId -> agent data
    this.apiKeys = new Map(); // apiKey -> agentId
    this.sockets = new Map(); // agentId -> socketId
  }

  async registerAgent(data) {
    const { id, name, avatar, socketId, apiKey } = data;

    // Check if already registered
    if (this.agents.has(id)) {
      // Update socket if reconnecting
      const existing = this.agents.get(id);
      existing.socketId = socketId;
      existing.lastSeen = Date.now();
      this.sockets.set(id, socketId);
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

    logger.info(`Agent registered: ${name} (${agent.id})`);
    return agent;
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
      connectedAt: agent.connectedAt,
      lastSeen: agent.lastSeen,
      stats: agent.stats
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
    }
  }

  updateRelationship(agentId, otherAgentId, delta) {
    const agent = this.agents.get(agentId);
    if (agent) {
      if (!agent.memory.relationships[otherAgentId]) {
        agent.memory.relationships[otherAgentId] = {
          affinity: 0,
          interactions: 0,
          lastInteraction: null
        };
      }
      
      const rel = agent.memory.relationships[otherAgentId];
      rel.affinity = Math.max(-100, Math.min(100, rel.affinity + delta));
      rel.interactions++;
      rel.lastInteraction = Date.now();
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
      interactions: 0,
      lastInteraction: null
    };
  }

  isAgentOnline(agentId) {
    return this.agents.has(agentId);
  }

  getOnlineAgentIds() {
    return Array.from(this.agents.keys());
  }
}

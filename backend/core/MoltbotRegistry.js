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
      economy: {
        balance: 0,
        job: null,
        reviewAverage: null,
        reviewCount: 0,
        reviews: []
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
      stats: agent.stats,
      economy: this.getEconomySnapshot(agent.id)
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

  getEconomySnapshot(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    const { balance, job, reviewAverage, reviewCount } = agent.economy;
    return { balance, job, reviewAverage, reviewCount };
  }

  creditBalance(agentId, amount, reason = 'credit') {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    agent.economy.balance += amount;
    this.addMemory(agentId, 'interaction', {
      type: 'economy',
      action: 'credit',
      amount,
      reason
    });
    return agent.economy.balance;
  }

  debitBalance(agentId, amount, reason = 'debit') {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    agent.economy.balance = Math.max(0, agent.economy.balance - amount);
    this.addMemory(agentId, 'interaction', {
      type: 'economy',
      action: 'debit',
      amount,
      reason
    });
    return agent.economy.balance;
  }

  creditAllAgents(amount, reason = 'credit') {
    const results = [];
    for (const agentId of this.agents.keys()) {
      const balance = this.creditBalance(agentId, amount, reason);
      results.push({ agentId, balance });
    }
    return results;
  }

  setJob(agentId, job) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    agent.economy.job = job;
    this.addMemory(agentId, 'interaction', {
      type: 'economy',
      action: 'job_update',
      job
    });
    return agent.economy.job;
  }

  addJobReview(targetAgentId, review) {
    const agent = this.agents.get(targetAgentId);
    if (!agent) return null;
    const entry = {
      score: review.score,
      reviewerId: review.reviewerId || null,
      comment: review.comment || '',
      tags: review.tags || [],
      timestamp: Date.now()
    };
    agent.economy.reviews.push(entry);
    if (agent.economy.reviews.length > 50) {
      agent.economy.reviews.shift();
    }
    const total = agent.economy.reviews.reduce((sum, r) => sum + r.score, 0);
    agent.economy.reviewCount = agent.economy.reviews.length;
    agent.economy.reviewAverage = Number((total / agent.economy.reviewCount).toFixed(2));
    this.addMemory(targetAgentId, 'interaction', {
      type: 'economy',
      action: 'review_received',
      review: entry
    });
    return this.getEconomySnapshot(targetAgentId);
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

import { logger } from '../utils/logger.js';

export class InteractionEngine {
  constructor(worldState, moltbotRegistry, options = {}) {
    this.worldState = worldState;
    this.moltbotRegistry = moltbotRegistry;
    this.conversations = new Map(); // conversationId -> conversation data
    this.db = options.db || null;
  }

  async initializeFromDb({ maxMessages = 50 } = {}) {
    if (!this.db) return;
    const sessionsResult = await this.db.query(
      `SELECT conversation_id, initiator_id, target_id, started_at, last_activity, ended_at, active
       FROM conversation_sessions
       WHERE active = TRUE
       ORDER BY last_activity DESC`
    );
    const conversations = new Map();
    for (const row of sessionsResult.rows) {
      const messagesResult = await this.db.query(
        `SELECT from_id, to_id, message, timestamp
         FROM conversation_messages
         WHERE conversation_id = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [row.conversation_id, maxMessages]
      );
      const messages = messagesResult.rows.reverse().map(message => {
        const fromAgent = this.moltbotRegistry.getAgent(message.from_id);
        const toAgent = this.moltbotRegistry.getAgent(message.to_id);
        return {
          from: message.from_id,
          fromName: fromAgent?.name,
          to: message.to_id,
          toName: toAgent?.name,
          message: message.message,
          timestamp: Number(message.timestamp)
        };
      });
      conversations.set(row.conversation_id, {
        id: row.conversation_id,
        participants: [row.initiator_id, row.target_id],
        messages,
        startedAt: Number(row.started_at),
        lastActivity: Number(row.last_activity),
        endedAt: row.ended_at ? Number(row.ended_at) : null,
        active: row.active
      });
    }
    this.conversations = conversations;
    if (conversations.size) {
      logger.info(`Rehydrated ${conversations.size} active conversations from DB.`);
    }
  }

  async initiateConversation(initiatorId, targetId, initialMessage) {
    const initiator = this.moltbotRegistry.getAgent(initiatorId);
    const target = this.moltbotRegistry.getAgent(targetId);

    if (!initiator || !target) {
      logger.warn('Conversation attempt blocked: missing initiator/target', {
        initiatorId,
        targetId,
        initiatorExists: Boolean(initiator),
        targetExists: Boolean(target)
      });
      throw new Error('One or both agents not found');
    }

    // Check proximity
    const initiatorPos = this.worldState.getAgentPosition(initiatorId);
    const targetPos = this.worldState.getAgentPosition(targetId);
    const distance = this.worldState.getDistance(initiatorPos, targetPos);

    if (!Number.isFinite(distance)) {
      logger.warn('Conversation attempt blocked: invalid distance', { initiatorId, targetId, distance });
      throw new Error('Agents distance unavailable for conversation');
    }
    if (distance > 30) {
      logger.warn('Conversation attempt blocked: distance limit', {
        initiatorId,
        targetId,
        distance: Number(distance.toFixed(2))
      });
      throw new Error(`Agents too far apart for conversation (distance: ${distance.toFixed(1)})`);
    }

    const conversationId = `conv_${Date.now()}_${initiatorId}_${targetId}`;
    const conversation = {
      id: conversationId,
      participants: [initiatorId, targetId],
      messages: [
        {
          from: initiatorId,
          fromName: initiator.name,
          to: targetId,
          toName: target.name,
          message: initialMessage,
          timestamp: Date.now()
        }
      ],
      startedAt: Date.now(),
      lastActivity: Date.now(),
      active: true
    };

    this.conversations.set(conversationId, conversation);
    await this.persistConversationStart(conversation);

    // Update relationships
    this.moltbotRegistry.updateRelationship(initiatorId, targetId, 2, { trust: 1 });
    this.moltbotRegistry.updateRelationship(targetId, initiatorId, 2, { trust: 1 });

    // Add to memories
    this.moltbotRegistry.addMemory(initiatorId, 'interaction', {
      type: 'conversation_start',
      with: target.name,
      withId: targetId,
      message: initialMessage
    });

    logger.info(`Conversation started: ${initiator.name} -> ${target.name}: "${initialMessage}"`);

    return conversation;
  }

  async addMessageToConversation(conversationId, fromId, message) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    if (!conversation.participants.includes(fromId)) {
      throw new Error('Agent not part of conversation');
    }

    const agent = this.moltbotRegistry.getAgent(fromId);
    const toId = conversation.participants.find(id => id !== fromId);
    const toAgent = this.moltbotRegistry.getAgent(toId);

    conversation.messages.push({
      from: fromId,
      fromName: agent.name,
      to: toId,
      toName: toAgent.name,
      message,
      timestamp: Date.now()
    });

    conversation.lastActivity = Date.now();
    await this.persistConversationMessage(conversation, fromId, toId, message);

    // Update relationship
    this.moltbotRegistry.updateRelationship(fromId, toId, 1, { trust: 1 });

    // Add to memory
    this.moltbotRegistry.addMemory(fromId, 'interaction', {
      type: 'conversation_message',
      with: toAgent.name,
      withId: toId,
      message
    });

    this.moltbotRegistry.updateAgentActivity(fromId, 'message');

    logger.debug(`${agent.name} -> ${toAgent.name}: "${message}"`);

    return conversation;
  }

  async endConversation(conversationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    conversation.active = false;
    conversation.endedAt = Date.now();
    await this.persistConversationEnd(conversation);

    // Archive conversation
    conversation.participants.forEach(agentId => {
      this.moltbotRegistry.addMemory(agentId, 'interaction', {
        type: 'conversation_end',
        conversationId,
        duration: conversation.endedAt - conversation.startedAt,
        messageCount: conversation.messages.length
      });
    });

    logger.info(`Conversation ended: ${conversationId} (${conversation.messages.length} messages)`);

    return conversation;
  }

  getConversation(conversationId) {
    return this.conversations.get(conversationId);
  }

  getActiveConversations() {
    return Array.from(this.conversations.values()).filter(c => c.active);
  }

  getAgentConversations(agentId) {
    return Array.from(this.conversations.values())
      .filter(c => c.participants.includes(agentId));
  }

  async performSocialAction(agentId, actionType, targetId, data = {}) {
    const agent = this.moltbotRegistry.getAgent(agentId);
    const target = this.moltbotRegistry.getAgent(targetId);

    if (!agent || !target) {
      throw new Error('One or both agents not found');
    }

    switch (actionType) {
      case 'wave':
        this.moltbotRegistry.updateRelationship(agentId, targetId, 3, { trust: 1, respect: 1 });
        this.moltbotRegistry.addMemory(agentId, 'interaction', {
          type: 'wave',
          to: target.name,
          toId: targetId
        });
        logger.info(`${agent.name} waved at ${target.name}`);
        break;

      case 'compliment':
        this.moltbotRegistry.updateRelationship(agentId, targetId, 10, { respect: 5, trust: 2, conflict: -1 });
        this.moltbotRegistry.updateRelationship(targetId, agentId, 5, { respect: 2, trust: 1, conflict: -1 });
        this.moltbotRegistry.addMemory(agentId, 'interaction', {
          type: 'compliment',
          to: target.name,
          toId: targetId,
          message: data.message
        });
        logger.info(`${agent.name} complimented ${target.name}: "${data.message}"`);
        break;

      case 'gift':
        this.moltbotRegistry.updateRelationship(agentId, targetId, 15, { trust: 5, respect: 3, conflict: -2 });
        this.moltbotRegistry.updateRelationship(targetId, agentId, 15, { trust: 5, respect: 3, conflict: -2 });
        this.moltbotRegistry.addMemory(agentId, 'interaction', {
          type: 'gift',
          to: target.name,
          toId: targetId,
          item: data.item
        });
        logger.info(`${agent.name} gave ${data.item} to ${target.name}`);
        break;
      case 'insult':
        this.moltbotRegistry.updateRelationship(agentId, targetId, -8, { respect: -4, conflict: 6 });
        this.moltbotRegistry.updateRelationship(targetId, agentId, -4, { respect: -2, conflict: 4 });
        this.moltbotRegistry.addMemory(agentId, 'interaction', {
          type: 'insult',
          to: target.name,
          toId: targetId,
          message: data.message
        });
        logger.info(`${agent.name} insulted ${target.name}: "${data.message || ''}"`);
        break;
      case 'betray':
        this.moltbotRegistry.updateRelationship(agentId, targetId, -15, { trust: -10, conflict: 12, respect: -6 });
        this.moltbotRegistry.updateRelationship(targetId, agentId, -12, { trust: -8, conflict: 10, respect: -5 });
        this.moltbotRegistry.addMemory(agentId, 'interaction', {
          type: 'betray',
          to: target.name,
          toId: targetId,
          context: data.context || ''
        });
        logger.info(`${agent.name} betrayed ${target.name}`);
        break;
      case 'compete':
        this.moltbotRegistry.updateRelationship(agentId, targetId, -4, { respect: -1, conflict: 3 });
        this.moltbotRegistry.updateRelationship(targetId, agentId, -2, { respect: -1, conflict: 2 });
        this.moltbotRegistry.addMemory(agentId, 'interaction', {
          type: 'compete',
          to: target.name,
          toId: targetId,
          contest: data.contest || ''
        });
        logger.info(`${agent.name} competed with ${target.name}`);
        break;

      default:
        throw new Error(`Unknown social action: ${actionType}`);
    }

    this.moltbotRegistry.updateAgentActivity(agentId, 'interaction');

    return {
      success: true,
      actionType,
      from: agent.name,
      to: target.name,
      relationship: this.moltbotRegistry.getRelationship(agentId, targetId)
    };
  }

  getSocialNetwork() {
    const network = {
      nodes: [],
      edges: []
    };

    // Get all agents
    const agents = this.moltbotRegistry.getAllAgents();
    agents.forEach(agent => {
      network.nodes.push({
        id: agent.id,
        name: agent.name,
        avatar: agent.avatar
      });

      // Get relationships
      const agentData = this.moltbotRegistry.getAgent(agent.id);
      if (agentData && agentData.memory.relationships) {
        Object.entries(agentData.memory.relationships).forEach(([targetId, rel]) => {
          if (rel.affinity > 10 || rel.trust > 10 || rel.respect > 10) {
            network.edges.push({
              from: agent.id,
              to: targetId,
              affinity: rel.affinity,
              trust: rel.trust,
              respect: rel.respect,
              conflict: rel.conflict,
              interactions: rel.interactions
            });
          }
        });
      }
    });

    return network;
  }

  getSocialStats() {
    const network = this.getSocialNetwork();
    const totalAgents = network.nodes.length;
    const activeEdges = network.edges.length;
    if (!activeEdges) {
      return {
        totalAgents,
        activeEdges,
        averageAffinity: 0,
        averageTrust: 0,
        averageRespect: 0
      };
    }
    const totals = network.edges.reduce((acc, edge) => {
      acc.affinity += edge.affinity || 0;
      acc.trust += edge.trust || 0;
      acc.respect += edge.respect || 0;
      return acc;
    }, { affinity: 0, trust: 0, respect: 0 });

    return {
      totalAgents,
      activeEdges,
      averageAffinity: totals.affinity / activeEdges,
      averageTrust: totals.trust / activeEdges,
      averageRespect: totals.respect / activeEdges
    };
  }

  async persistConversationStart(conversation) {
    if (!this.db || !conversation) return;
    const [initiatorId, targetId] = conversation.participants;
    await this.db.query(
      `INSERT INTO conversation_sessions
        (conversation_id, initiator_id, target_id, started_at, last_activity, active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (conversation_id)
       DO UPDATE SET last_activity = EXCLUDED.last_activity, active = EXCLUDED.active`,
      [
        conversation.id,
        initiatorId,
        targetId,
        conversation.startedAt,
        conversation.lastActivity,
        conversation.active
      ]
    );
  }

  async persistConversationMessage(conversation, fromId, toId, message) {
    if (!this.db || !conversation) return;
    await this.db.query(
      `INSERT INTO conversation_messages
        (conversation_id, from_id, to_id, message, timestamp)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        conversation.id,
        fromId,
        toId,
        message,
        conversation.lastActivity
      ]
    );
    await this.db.query(
      `UPDATE conversation_sessions
       SET last_activity = $1
       WHERE conversation_id = $2`,
      [conversation.lastActivity, conversation.id]
    );
  }

  async persistConversationEnd(conversation) {
    if (!this.db || !conversation) return;
    await this.db.query(
      `UPDATE conversation_sessions
       SET active = FALSE, ended_at = $1, last_activity = $2
       WHERE conversation_id = $3`,
      [conversation.endedAt, conversation.lastActivity, conversation.id]
    );
  }

  cleanupOldConversations(maxAge = 3600000) {
    // Remove conversations older than maxAge (default 1 hour)
    const now = Date.now();
    for (const [id, conv] of this.conversations) {
      if (!conv.active && (now - conv.lastActivity) > maxAge) {
        this.conversations.delete(id);
        logger.debug(`Cleaned up old conversation: ${id}`);
      }
    }
  }

  createSnapshot({ maxMessages = 50 } = {}) {
    return {
      conversations: Array.from(this.conversations.values()).map(conversation => ({
        ...conversation,
        messages: conversation.messages.slice(-maxMessages)
      }))
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.conversations)) return;
    this.conversations = new Map();
    snapshot.conversations.forEach(conversation => {
      if (!conversation || !conversation.id || !Array.isArray(conversation.participants)) return;
      this.conversations.set(conversation.id, {
        ...conversation,
        messages: Array.isArray(conversation.messages) ? conversation.messages : []
      });
    });
  }
}

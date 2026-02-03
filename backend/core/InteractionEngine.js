import { logger } from '../utils/logger.js';

export class InteractionEngine {
  constructor(worldState, moltbotRegistry) {
    this.worldState = worldState;
    this.moltbotRegistry = moltbotRegistry;
    this.conversations = new Map(); // conversationId -> conversation data
  }

  async initiateConversation(initiatorId, targetId, initialMessage) {
    const initiator = this.moltbotRegistry.getAgent(initiatorId);
    const target = this.moltbotRegistry.getAgent(targetId);

    if (!initiator || !target) {
      throw new Error('One or both agents not found');
    }

    // Check proximity
    const initiatorPos = this.worldState.getAgentPosition(initiatorId);
    const targetPos = this.worldState.getAgentPosition(targetId);
    const distance = this.worldState.getDistance(initiatorPos, targetPos);

    if (distance > 3) {
      throw new Error('Agents too far apart for conversation');
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

    // Update relationships
    this.moltbotRegistry.updateRelationship(initiatorId, targetId, 2);
    this.moltbotRegistry.updateRelationship(targetId, initiatorId, 2);

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

    // Update relationship
    this.moltbotRegistry.updateRelationship(fromId, toId, 1);

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
        this.moltbotRegistry.updateRelationship(agentId, targetId, 3);
        this.moltbotRegistry.addMemory(agentId, 'interaction', {
          type: 'wave',
          to: target.name,
          toId: targetId
        });
        logger.info(`${agent.name} waved at ${target.name}`);
        break;

      case 'compliment':
        this.moltbotRegistry.updateRelationship(agentId, targetId, 10);
        this.moltbotRegistry.updateRelationship(targetId, agentId, 5);
        this.moltbotRegistry.addMemory(agentId, 'interaction', {
          type: 'compliment',
          to: target.name,
          toId: targetId,
          message: data.message
        });
        logger.info(`${agent.name} complimented ${target.name}: "${data.message}"`);
        break;

      case 'gift':
        this.moltbotRegistry.updateRelationship(agentId, targetId, 15);
        this.moltbotRegistry.updateRelationship(targetId, agentId, 15);
        this.moltbotRegistry.addMemory(agentId, 'interaction', {
          type: 'gift',
          to: target.name,
          toId: targetId,
          item: data.item
        });
        logger.info(`${agent.name} gave ${data.item} to ${target.name}`);
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
          if (rel.affinity > 10) { // Only show significant relationships
            network.edges.push({
              from: agent.id,
              to: targetId,
              affinity: rel.affinity,
              interactions: rel.interactions
            });
          }
        });
      }
    });

    return network;
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
}

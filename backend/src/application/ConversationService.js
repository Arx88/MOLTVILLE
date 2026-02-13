export class ConversationService {
  constructor({ interactionEngine, registry, io, recordIntentSignal }) {
    this.interactionEngine = interactionEngine;
    this.registry = registry;
    this.io = io;
    this.recordIntentSignal = recordIntentSignal;
  }

  async startConversation(fromAgentId, targetId, message) {
    const conversation = await this.interactionEngine.initiateConversation(fromAgentId, targetId, message.trim());
    this.recordIntentSignal('conversation_start', { agentId: fromAgentId });
    conversation.participants.forEach(participantId => {
      const socketId = this.registry.getAgentSocket(participantId);
      if (socketId) this.io.to(socketId).emit('conversation:started', conversation);
    });
    return conversation;
  }

  async addMessage(conversationId, fromAgentId, message) {
    const conversation = await this.interactionEngine.addMessageToConversation(conversationId, fromAgentId, message.trim());
    this.recordIntentSignal('conversation_message', { agentId: fromAgentId });
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    conversation.participants.forEach(participantId => {
      const socketId = this.registry.getAgentSocket(participantId);
      if (socketId) this.io.to(socketId).emit('conversation:message', { conversationId, message: lastMessage });
    });
    return { conversation, lastMessage };
  }

  async endConversation(conversationId, byAgentId) {
    const conversation = await this.interactionEngine.endConversation(conversationId);
    this.recordIntentSignal('conversation_end', { agentId: byAgentId });
    conversation.participants.forEach(participantId => {
      const socketId = this.registry.getAgentSocket(participantId);
      if (socketId) this.io.to(socketId).emit('conversation:ended', { conversationId, endedAt: conversation.endedAt });
    });
    return conversation;
  }
}

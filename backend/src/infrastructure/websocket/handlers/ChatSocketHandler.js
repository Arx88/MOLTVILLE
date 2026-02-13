import { hasPermission } from '../../../../utils/permissions.js';

export function registerChatSocketHandler(socket, ctx) {
  const {
    io, logger, actionQueue, worldState, interactionEngine, moltbotRegistry,
    trackSocketEvent, recordSocketError, recordSocketDuration,
    sanitizeText, sanitizeId, applySocketBackoff, shouldBlockSocket, isSocketRateLimited,
    trackSocketRateLimit, ensureActiveApiKey, SOCKET_RATE_LIMIT_MS, SOCKET_SPEAK_LIMIT_MS
  } = ctx;

  socket.on('agent:move', async (data) => enqueueMove('MOVE', 'agent:move', data));
  socket.on('agent:moveTo', async (data) => enqueueMove('MOVE_TO', 'agent:moveTo', data));

  const enqueueMove = async (type, eventName, data) => {
    const eventStart = Date.now();
    trackSocketEvent(eventName);
    try {
      if (!socket.agentId) return socket.emit('error', { message: 'Not authenticated' });
      if (!hasPermission(moltbotRegistry.getAgent(socket.agentId)?.permissions, 'move')) return socket.emit('error', { message: 'Permission denied' });
      if (!ensureActiveApiKey(socket, moltbotRegistry)) return;
      if (shouldBlockSocket(socket)) return socket.emit('error', { message: 'Move rate limit blocked' });
      if (isSocketRateLimited(socket, eventName, SOCKET_RATE_LIMIT_MS)) {
        trackSocketRateLimit(eventName);
        const blockDuration = applySocketBackoff(socket);
        return socket.emit('error', { message: blockDuration ? `Move rate limit blocked for ${Math.ceil(blockDuration / 1000)}s` : 'Move rate limit exceeded' });
      }
      const { targetX, targetY } = data;
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return socket.emit('error', { message: 'Invalid move target' });
      await actionQueue.enqueue({ type, agentId: socket.agentId, targetX, targetY, timestamp: Date.now() });
    } catch (error) {
      recordSocketError(eventName, error); logger.error(`${eventName} error:`, error); socket.emit('error', { message: error.message });
    } finally { recordSocketDuration(eventName, Date.now() - eventStart); }
  };

  socket.on('agent:speak', async (data) => {
    const eventStart = Date.now();
    trackSocketEvent('agent:speak');
    try {
      if (!socket.agentId) return socket.emit('error', { message: 'Not authenticated' });
      if (!hasPermission(moltbotRegistry.getAgent(socket.agentId)?.permissions, 'speak')) return socket.emit('error', { message: 'Permission denied' });
      if (!ensureActiveApiKey(socket, moltbotRegistry)) return;
      const message = sanitizeText(data?.message, 500);
      if (!message) return socket.emit('error', { message: 'Message required' });
      const agent = moltbotRegistry.getAgent(socket.agentId);
      const position = worldState.getAgentPosition(socket.agentId);
      io.emit('agent:spoke', { agentId: socket.agentId, agentName: agent.name, message, position, timestamp: Date.now() });
    } catch (error) {
      recordSocketError('agent:speak', error); socket.emit('error', { message: error.message });
    } finally { recordSocketDuration('agent:speak', Date.now() - eventStart); }
  });

  socket.on('agent:conversation:start', async (data = {}) => {
    const eventStart = Date.now();
    trackSocketEvent('agent:conversation:start');
    try {
      if (!socket.agentId) return socket.emit('error', { message: 'Not authenticated' });
      if (!hasPermission(moltbotRegistry.getAgent(socket.agentId)?.permissions, 'converse')) return socket.emit('error', { message: 'Permission denied' });
      if (!ensureActiveApiKey(socket, moltbotRegistry)) return;
      if (shouldBlockSocket(socket)) return socket.emit('error', { message: 'Conversation rate limit blocked' });
      if (isSocketRateLimited(socket, 'agent:conversation:start', SOCKET_SPEAK_LIMIT_MS)) {
        trackSocketRateLimit('agent:conversation:start');
        const blockDuration = applySocketBackoff(socket);
        return socket.emit('error', { message: blockDuration ? `Conversation rate limit blocked for ${Math.ceil(blockDuration / 1000)}s` : 'Conversation rate limit exceeded' });
      }
      const targetId = sanitizeId(data?.targetId);
      const message = sanitizeText(data?.message, 500);
      if (!targetId || !message) return socket.emit('error', { message: 'targetId and message are required' });
      const conversation = await ctx.services.conversationService.startConversation(socket.agentId, targetId, message);
      ctx.emitViewerEvent('conversation:started', {
        conversationId: conversation.id,
        fromId: conversation.messages[0]?.from,
        fromName: conversation.messages[0]?.fromName,
        toId: conversation.messages[0]?.to,
        toName: conversation.messages[0]?.toName,
        message: conversation.messages[0]?.message,
        timestamp: conversation.messages[0]?.timestamp
      });
    } catch (error) {
      recordSocketError('agent:conversation:start', error); socket.emit('error', { message: error.message });
    } finally { recordSocketDuration('agent:conversation:start', Date.now() - eventStart); }
  });

  socket.on('agent:conversation:message', async (data = {}) => {
    const eventStart = Date.now();
    trackSocketEvent('agent:conversation:message');
    try {
      if (!socket.agentId) return socket.emit('error', { message: 'Not authenticated' });
      const conversationId = sanitizeId(data?.conversationId);
      const message = sanitizeText(data?.message, 500);
      if (!conversationId || !message) return socket.emit('error', { message: 'conversationId and message are required' });
      const result = await ctx.services.conversationService.addMessage(conversationId, socket.agentId, message);
      ctx.emitViewerEvent('conversation:message', { conversationId, message: result.lastMessage });
    } catch (error) {
      recordSocketError('agent:conversation:message', error); socket.emit('error', { message: error.message });
    } finally { recordSocketDuration('agent:conversation:message', Date.now() - eventStart); }
  });

  socket.on('agent:conversation:end', async (data = {}) => {
    const conversationId = sanitizeId(data?.conversationId);
    if (!conversationId) return socket.emit('error', { message: 'conversationId is required' });
    const conversation = await ctx.services.conversationService.endConversation(conversationId, socket.agentId);
    ctx.emitViewerEvent('conversation:ended', { conversationId, endedAt: conversation.endedAt });
  });

  socket.on('agent:social', async (data = {}) => {
    const actionType = sanitizeId(data?.actionType);
    const targetId = sanitizeId(data?.targetId);
    if (!socket.agentId || !actionType || !targetId) return;
    const result = await interactionEngine.performSocialAction(socket.agentId, actionType, targetId, data?.data || {});
    socket.emit('agent:social:result', result);
    ctx.emitViewerEvent('agent:social', { ...result, agentId: socket.agentId, targetId });
  });

  socket.on('agent:action', async (data = {}) => {
    const actionType = sanitizeId(data?.actionType);
    if (!socket.agentId || !actionType) return;
    await actionQueue.enqueue({ type: 'ACTION', agentId: socket.agentId, actionType, target: data?.target, params: data?.params, timestamp: Date.now() });
    ctx.emitViewerEvent('agent:action', { agentId: socket.agentId, actionType, target: data?.target, params: data?.params });
  });
}

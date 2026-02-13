import { hasPermission } from '../../../../utils/permissions.js';

export function registerAgentSocketHandler(socket, ctx) {
  const {
    io, logger, services, moltbotRegistry, worldState, economyManager,
    trackSocketEvent, recordSocketError, recordSocketDuration, recordIntentSignal,
    telemetryService, disconnectTimers, AGENT_DISCONNECT_GRACE_MS, socketRateState
  } = ctx;

  socket.on('agent:connect', async (data) => {
    const eventStart = Date.now();
    trackSocketEvent('agent:connect');
    try {
      if (socket.role && socket.role !== 'agent') return socket.emit('error', { message: 'Agent access denied' });
      const { apiKey, agentId, agentName, avatar } = data;
      const permissions = Array.isArray(data?.permissions) ? data.permissions : undefined;
      if (typeof apiKey !== 'string' || apiKey.trim().length < 32) return socket.emit('error', { message: 'Invalid API key' });
      if (typeof agentName !== 'string' || agentName.trim().length === 0) return socket.emit('error', { message: 'Agent name is required' });

      const normalizedApiKey = apiKey.trim();
      const existingAgent = agentId ? moltbotRegistry.getAgent(agentId) : null;
      if (!existingAgent && !moltbotRegistry.isApiKeyIssued(normalizedApiKey)) return socket.emit('error', { message: 'API key not issued' });
      if (existingAgent && existingAgent.apiKey && existingAgent.apiKey !== normalizedApiKey) return socket.emit('error', { message: 'API key mismatch' });

      const agent = await moltbotRegistry.registerAgent({ id: agentId, name: agentName.trim(), avatar: avatar || 'char1', permissions, socketId: socket.id, apiKey: normalizedApiKey });
      const existingTimer = disconnectTimers.get(agent.id);
      if (existingTimer) { clearTimeout(existingTimer); disconnectTimers.delete(agent.id); }
      economyManager.registerAgent(agent.id);

      const existingPosition = worldState.getAgentPosition(agent.id);
      const spawnPosition = existingPosition || worldState.getRandomSpawnPosition();
      if (!existingPosition) worldState.addAgent(agent.id, spawnPosition);

      socket.role = 'agent';
      socket.agentId = agent.id;
      socket.join('agents');
      socket.emit('agent:registered', {
        agentId: agent.id,
        position: spawnPosition,
        movement: worldState.getAgentMovementState(agent.id),
        inventory: economyManager.getInventory(agent.id),
        balance: economyManager.getBalance(agent.id),
        context: services.agentService.buildContext(agent.id),
        permissions: agent.permissions,
        worldState: services.agentService.getAgentPerception(agent.id)
      });

      if (!existingPosition) io.emit('agent:spawned', { id: agent.id, name: agent.name, avatar: agent.avatar, position: spawnPosition });
      logger.info(`Agent connected: ${agentName} (${agent.id})`);
    } catch (error) {
      logger.error('Agent connection error:', error);
      recordSocketError('agent:connect', error);
      socket.emit('error', { message: error.message });
    } finally {
      recordSocketDuration('agent:connect', Date.now() - eventStart);
    }
  });

  socket.on('agent:profile', (data = {}) => {
    if (!socket.agentId) return;
    recordIntentSignal('profile_update', { agentId: socket.agentId });
    const updated = moltbotRegistry.updateAgentProfile(socket.agentId, data);
    if (updated) io.to('viewers').emit('agents:list', services.agentService.getViewerAgents());
  });

  socket.on('telemetry:action', (data = {}) => {
    if (!socket.agentId) return;
    recordIntentSignal('telemetry_action', { agentId: socket.agentId });
    const entry = telemetryService.track(data.event || 'agent_action', { agentId: socket.agentId, ...data });
    io.to('viewers').emit('telemetry:action', entry);
  });

  socket.on('agent:perceive', () => {
    if (!socket.agentId) return socket.emit('error', { message: 'Not authenticated' });
    if (!hasPermission(moltbotRegistry.getAgent(socket.agentId)?.permissions, 'perceive')) return socket.emit('error', { message: 'Permission denied' });
    recordIntentSignal('perceive', { agentId: socket.agentId });
    socket.emit('perception:update', {
      ...services.agentService.getAgentPerception(socket.agentId),
      events: ctx.eventManager.getSummary(),
      conversations: ctx.interactionEngine.getAgentConversations(socket.agentId)
    });
  });

  socket.on('disconnect', () => {
    if (!socket.agentId) return;
    const agent = moltbotRegistry.getAgent(socket.agentId);
    if (!agent) return;
    moltbotRegistry.setAgentConnection(socket.agentId, false);
    const existingTimer = disconnectTimers.get(socket.agentId);
    if (existingTimer) clearTimeout(existingTimer);
    const timeoutId = setTimeout(() => {
      const currentAgent = moltbotRegistry.getAgent(socket.agentId);
      if (currentAgent && !currentAgent.connected) {
        worldState.removeAgent(socket.agentId);
        moltbotRegistry.unregisterAgent(socket.agentId);
        io.emit('agent:disconnected', { agentId: socket.agentId, agentName: currentAgent.name });
      }
      disconnectTimers.delete(socket.agentId);
    }, AGENT_DISCONNECT_GRACE_MS);
    disconnectTimers.set(socket.agentId, timeoutId);
    socketRateState.delete(socket.agentId);
  });
}

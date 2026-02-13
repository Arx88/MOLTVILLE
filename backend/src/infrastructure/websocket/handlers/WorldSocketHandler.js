export function registerWorldSocketHandler(socket, ctx) {
  const { trackSocketEvent, recordSocketDuration, config, logger, metrics } = ctx;

  socket.on('viewer:join', (payload = {}) => {
    const eventStart = Date.now();
    trackSocketEvent('viewer:join');
    try {
      if (socket.role && socket.role !== 'viewer') {
        socket.emit('error', { message: 'Viewer access denied' });
        return;
      }
      if (config.viewerApiKey) {
        const hasViewerKey = payload.apiKey && payload.apiKey === config.viewerApiKey;
        const hasAdminKey = config.adminApiKey && payload.adminKey === config.adminApiKey;
        if (!hasViewerKey && !hasAdminKey) {
          socket.emit('error', { message: 'Viewer API key required' });
          return;
        }
      }
      socket.role = 'viewer';
      socket.join('viewers');
      socket.emit('world:state', {
        ...ctx.services.worldService.getViewerState(),
        economy: ctx.services.economyService.getViewerSummary()
      });
      socket.emit('agents:list', ctx.services.agentService.getViewerAgents());
      logger.info(`Viewer joined: ${socket.id}`);
    } finally {
      recordSocketDuration('viewer:join', Date.now() - eventStart);
    }
  });

  socket.on('disconnect', () => {
    metrics.socket.disconnections += 1;
    logger.info(`Client disconnected: ${socket.id}`);
  });
}

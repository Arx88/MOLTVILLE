export function registerGracefulShutdown({ httpServer, worldRuntime, logger }) {
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    worldRuntime.stop();
    httpServer.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

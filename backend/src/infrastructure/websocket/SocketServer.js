import { registerAgentSocketHandler } from './handlers/AgentSocketHandler.js';
import { registerChatSocketHandler } from './handlers/ChatSocketHandler.js';
import { registerWorldSocketHandler } from './handlers/WorldSocketHandler.js';

export function registerSocketServer(io, ctx) {
  io.on('connection', (socket) => {
    ctx.metrics.socket.connections += 1;
    ctx.logger.info(`Client connected: ${socket.id}`);

    registerWorldSocketHandler(socket, ctx);
    registerAgentSocketHandler(socket, ctx);
    registerChatSocketHandler(socket, ctx);
  });
}

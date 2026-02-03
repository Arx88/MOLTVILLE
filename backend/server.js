import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import { logger } from './utils/logger.js';
import { WorldStateManager } from './core/WorldStateManager.js';
import { MoltbotRegistry } from './core/MoltbotRegistry.js';
import { InteractionEngine } from './core/InteractionEngine.js';
import { ActionQueue } from './core/ActionQueue.js';
import { EconomyManager } from './core/EconomyManager.js';
import { VotingManager } from './core/VotingManager.js';
import { GovernanceManager } from './core/GovernanceManager.js';
import { db } from './utils/db.js';

import authRoutes from './routes/auth.js';
import moltbotRoutes from './routes/moltbot.js';
import worldRoutes from './routes/world.js';
import economyRoutes from './routes/economy.js';
import voteRoutes from './routes/vote.js';
import governanceRoutes from './routes/governance.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: parseInt(process.env.API_RATE_WINDOW_MS) || 60000,
  max: parseInt(process.env.API_RATE_LIMIT) || 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Initialize core systems
const worldState = new WorldStateManager();
const moltbotRegistry = new MoltbotRegistry();
const actionQueue = new ActionQueue(worldState, moltbotRegistry);
const interactionEngine = new InteractionEngine(worldState, moltbotRegistry);
const economyManager = new EconomyManager(worldState, { db });
const votingManager = new VotingManager(worldState, io, { db });
const governanceManager = new GovernanceManager(io, { db });

app.locals.worldState = worldState;
app.locals.moltbotRegistry = moltbotRegistry;
app.locals.actionQueue = actionQueue;
app.locals.interactionEngine = interactionEngine;
app.locals.economyManager = economyManager;
app.locals.votingManager = votingManager;
app.locals.governanceManager = governanceManager;
app.locals.io = io;

if (db) {
  economyManager.initializeFromDb().catch(error => logger.error('Economy init failed:', error));
  votingManager.initializeFromDb().catch(error => logger.error('Voting init failed:', error));
  governanceManager.initializeFromDb().catch(error => logger.error('Governance init failed:', error));
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/moltbot', moltbotRoutes);
app.use('/api/world', worldRoutes);
app.use('/api/economy', economyRoutes);
app.use('/api/vote', voteRoutes);
app.use('/api/governance', governanceRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    agents: moltbotRegistry.getAgentCount(),
    worldTick: worldState.getCurrentTick()
  });
});

// ── WebSocket Handling ──
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Viewer joins
  socket.on('viewer:join', () => {
    socket.join('viewers');
    socket.emit('world:state', {
      ...worldState.getFullState(),
      governance: governanceManager.getSummary()
    });
    socket.emit('agents:list', moltbotRegistry.getAllAgents());
    logger.info(`Viewer joined: ${socket.id}`);
  });

  // Moltbot agent connection
  socket.on('agent:connect', async (data) => {
    try {
      const { apiKey, agentId, agentName, avatar } = data;

      if (!apiKey || apiKey.length < 32) {
        socket.emit('error', { message: 'Invalid API key' });
        return;
      }

      const agent = await moltbotRegistry.registerAgent({
        id: agentId, name: agentName,
        avatar: avatar || 'char1',
        socketId: socket.id, apiKey
      });
      economyManager.registerAgent(agent.id);

      const spawnPosition = worldState.getRandomSpawnPosition();
      worldState.addAgent(agent.id, spawnPosition);

      socket.agentId = agent.id;
      socket.join('agents');

      socket.emit('agent:registered', {
        agentId: agent.id,
        position: spawnPosition,
        worldState: {
          ...worldState.getAgentView(agent.id),
          governance: governanceManager.getSummary()
        }
      });

      io.emit('agent:spawned', {
        id: agent.id, name: agent.name,
        avatar: agent.avatar, position: spawnPosition
      });

      logger.info(`Agent connected: ${agentName} (${agent.id})`);
    } catch (error) {
      logger.error('Agent connection error:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // ── Single-step move (legacy) ──
  socket.on('agent:move', async (data) => {
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      const { targetX, targetY } = data;
      await actionQueue.enqueue({
        type: 'MOVE', agentId: socket.agentId,
        targetX, targetY, timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Move error:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // ── Full pathfinding move: "go to this tile" ──
  socket.on('agent:moveTo', async (data) => {
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      const { targetX, targetY } = data;
      await actionQueue.enqueue({
        type: 'MOVE_TO', agentId: socket.agentId,
        targetX, targetY, timestamp: Date.now()
      });
    } catch (error) {
      logger.error('MoveTo error:', error);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('agent:speak', async (data) => {
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      const { message } = data;
      const agent = moltbotRegistry.getAgent(socket.agentId);
      const position = worldState.getAgentPosition(socket.agentId);

      io.emit('agent:spoke', {
        agentId: socket.agentId, agentName: agent.name,
        message, position, timestamp: Date.now()
      });

      const nearbyAgents = worldState.getAgentsInRadius(position, 5);
      for (const nearbyId of nearbyAgents) {
        if (nearbyId !== socket.agentId) {
          const nearbySocket = moltbotRegistry.getAgentSocket(nearbyId);
          if (nearbySocket) {
            io.to(nearbySocket).emit('perception:speech', {
              from: agent.name, fromId: socket.agentId, message,
              distance: worldState.getDistance(position, worldState.getAgentPosition(nearbyId))
            });
          }
        }
      }
      logger.info(`${agent.name} spoke: "${message}"`);
    } catch (error) {
      logger.error('Speak error:', error);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('agent:action', async (data) => {
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      const { actionType, target, params } = data;
      await actionQueue.enqueue({
        type: 'ACTION', agentId: socket.agentId,
        actionType, target, params, timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Action error:', error);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('agent:perceive', (data) => {
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      socket.emit('perception:update', {
        ...worldState.getAgentView(socket.agentId),
        governance: governanceManager.getSummary()
      });
    } catch (error) {
      logger.error('Perceive error:', error);
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('disconnect', () => {
    if (socket.agentId) {
      const agent = moltbotRegistry.getAgent(socket.agentId);
      if (agent) {
        worldState.removeAgent(socket.agentId);
        moltbotRegistry.unregisterAgent(socket.agentId);
        io.emit('agent:disconnected', { agentId: socket.agentId, agentName: agent.name });
        logger.info(`Agent disconnected: ${agent.name} (${socket.agentId})`);
      }
    }
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// ── World Update Loop ──
// Now broadcasts interpolated positions for smooth client rendering
setInterval(() => {
  worldState.tick();
  actionQueue.processQueue();
  economyManager.tick();
  votingManager.tick();
  governanceManager.tick();

  // Broadcast interpolated agent positions to viewers
  io.to('viewers').emit('world:tick', {
    tick: worldState.getCurrentTick(),
    agents: worldState.getAllAgentPositions(), // includes interpolated x,y
    worldTime: worldState.getTimeState(),
    weather: worldState.getWeatherState(),
    vote: votingManager.getVoteSummary(),
    governance: governanceManager.getSummary()
  });
}, parseInt(process.env.WORLD_TICK_RATE) || 100);

// Error handling
app.use((err, req, res, next) => {
  logger.error('Express error:', err);
  res.status(err.status || 500).json({
    error: { message: err.message || 'Internal server error', status: err.status || 500 }
  });
});

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  logger.info(`🏙️  MOLTVILLE Server running on port ${PORT}`);
  logger.info(`📡 WebSocket ready for Moltbot connections`);
  logger.info(`🌍 World tick rate: ${process.env.WORLD_TICK_RATE || 100}ms`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => { logger.info('Server closed'); process.exit(0); });
});

export { io, worldState, moltbotRegistry, actionQueue, interactionEngine };

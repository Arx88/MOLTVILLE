import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { logger } from './utils/logger.js';
import { config } from './utils/config.js';
import {
  metrics,
  recordTickDuration,
  trackHttpRequest,
  trackSocketEvent,
  trackSocketRateLimit
} from './utils/metrics.js';
import { WorldStateManager } from './core/WorldStateManager.js';
import { MoltbotRegistry } from './core/MoltbotRegistry.js';
import { InteractionEngine } from './core/InteractionEngine.js';
import { ActionQueue } from './core/ActionQueue.js';
import { EconomyManager } from './core/EconomyManager.js';
import { VotingManager } from './core/VotingManager.js';
import { GovernanceManager } from './core/GovernanceManager.js';
import { db } from './utils/db.js';
import { CityMoodManager } from './core/CityMoodManager.js';
import { AestheticsManager } from './core/AestheticsManager.js';
import { EventManager } from './core/EventManager.js';

import authRoutes from './routes/auth.js';
import moltbotRoutes from './routes/moltbot.js';
import worldRoutes from './routes/world.js';
import economyRoutes from './routes/economy.js';
import voteRoutes from './routes/vote.js';
import governanceRoutes from './routes/governance.js';
import { createAestheticsRouter } from './routes/aesthetics.js';
import eventRoutes from './routes/events.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: config.frontendUrl,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: config.frontendUrl,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(trackHttpRequest);

const limiter = rateLimit({
  windowMs: config.apiRateWindowMs,
  max: config.apiRateLimit,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

const SOCKET_RATE_LIMIT_MS = config.socketRateLimitMs;
const SOCKET_SPEAK_LIMIT_MS = config.socketSpeakLimitMs;
const SOCKET_PERCEIVE_LIMIT_MS = config.socketPerceiveLimitMs;
const AGENT_DISCONNECT_GRACE_MS = config.agentDisconnectGraceMs;

const isSocketRateLimited = (socket, eventName, minIntervalMs) => {
  if (!socket.rateLimits) {
    socket.rateLimits = new Map();
  }
  const now = Date.now();
  const lastAt = socket.rateLimits.get(eventName) || 0;
  if (now - lastAt < minIntervalMs) {
    return true;
  }
  socket.rateLimits.set(eventName, now);
  return false;
};

const ensureActiveApiKey = (socket, registry) => {
  if (!socket.agentId) return true;
  const agent = registry.getAgent(socket.agentId);
  if (!agent || !registry.isApiKeyIssued(agent.apiKey)) {
    socket.emit('error', { message: 'API key revoked' });
    socket.disconnect(true);
    return false;
  }
  return true;
};

const disconnectTimers = new Map();

// Initialize core systems
const worldState = new WorldStateManager();
const moltbotRegistry = new MoltbotRegistry({ db });
const actionQueue = new ActionQueue(worldState, moltbotRegistry);
const interactionEngine = new InteractionEngine(worldState, moltbotRegistry);
const economyManager = new EconomyManager(worldState, { db, io });
const votingManager = new VotingManager(worldState, io, { db, economyManager });
const governanceManager = new GovernanceManager(io, { db });
const cityMoodManager = new CityMoodManager(economyManager, interactionEngine);
const aestheticsManager = new AestheticsManager({ worldStateManager: worldState, economyManager, governanceManager, io });
const eventManager = new EventManager({ io });

app.locals.worldState = worldState;
app.locals.moltbotRegistry = moltbotRegistry;
app.locals.actionQueue = actionQueue;
app.locals.interactionEngine = interactionEngine;
app.locals.economyManager = economyManager;
app.locals.votingManager = votingManager;
app.locals.governanceManager = governanceManager;
app.locals.cityMoodManager = cityMoodManager;
app.locals.aestheticsManager = aestheticsManager;
app.locals.eventManager = eventManager;
app.locals.io = io;

if (db) {
  moltbotRegistry.initializeFromDb().catch(error => logger.error('API key init failed:', error));
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
app.use('/api/aesthetics', createAestheticsRouter({ aestheticsManager }));
app.use('/api/events', eventRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    agents: moltbotRegistry.getAgentCount(),
    worldTick: worldState.getCurrentTick()
  });
});

app.get('/api/metrics', (req, res) => {
  const viewersRoom = io.sockets.adapter.rooms.get('viewers');
  const events = eventManager.getSummary();
  const eventCounts = events.reduce(
    (acc, event) => {
      acc.total += 1;
      acc[event.status] += 1;
      return acc;
    },
    { total: 0, scheduled: 0, active: 0, ended: 0 }
  );
  res.json({
    uptimeSec: Math.floor((Date.now() - metrics.startTime) / 1000),
    http: metrics.http,
    socket: {
      ...metrics.socket,
      connectedClients: io.sockets.sockets.size,
      connectedAgents: moltbotRegistry.getAgentCount(),
      connectedViewers: viewersRoom ? viewersRoom.size : 0
    },
    economy: {
      agentsWithBalance: economyManager.balances.size,
      averageBalance: economyManager.getAverageBalance(),
      inventory: economyManager.getInventoryStats(),
      itemTransactions: economyManager.getItemTransactions(500).length
    },
    events: eventCounts,
    world: metrics.world
  });
});

// ── WebSocket Handling ──
io.on('connection', (socket) => {
  metrics.socket.connections += 1;
  logger.info(`Client connected: ${socket.id}`);

  // Viewer joins
  socket.on('viewer:join', () => {
    trackSocketEvent('viewer:join');
    if (socket.role && socket.role !== 'viewer') {
      socket.emit('error', { message: 'Viewer access denied' });
      return;
    }
    socket.role = 'viewer';
    socket.join('viewers');
    socket.emit('world:state', {
      ...worldState.getFullState(),
      governance: governanceManager.getSummary(),
      mood: cityMoodManager.getSummary(),
      events: eventManager.getSummary(),
      economy: {
        inventories: economyManager.getAllInventories(),
        itemTransactions: economyManager.getItemTransactions()
      }
    });
    socket.emit('agents:list', moltbotRegistry.getAllAgents());
    logger.info(`Viewer joined: ${socket.id}`);
  });

  // Moltbot agent connection
  socket.on('agent:connect', async (data) => {
    trackSocketEvent('agent:connect');
    try {
      if (socket.role && socket.role !== 'agent') {
        socket.emit('error', { message: 'Agent access denied' });
        return;
      }
      const { apiKey, agentId, agentName, avatar } = data;

      if (typeof apiKey !== 'string' || apiKey.trim().length < 32) {
        socket.emit('error', { message: 'Invalid API key' });
        return;
      }
      if (typeof agentName !== 'string' || agentName.trim().length === 0) {
        socket.emit('error', { message: 'Agent name is required' });
        return;
      }
      const normalizedApiKey = apiKey.trim();
      const existingAgent = agentId ? moltbotRegistry.getAgent(agentId) : null;
      if (!existingAgent && !moltbotRegistry.isApiKeyIssued(normalizedApiKey)) {
        socket.emit('error', { message: 'API key not issued' });
        return;
      }
      if (existingAgent && existingAgent.apiKey && existingAgent.apiKey !== normalizedApiKey) {
        socket.emit('error', { message: 'API key mismatch' });
        return;
      }

      const agent = await moltbotRegistry.registerAgent({
        id: agentId, name: agentName.trim(),
        avatar: avatar || 'char1',
        socketId: socket.id, apiKey: normalizedApiKey
      });
      const existingTimer = disconnectTimers.get(agent.id);
      if (existingTimer) {
        clearTimeout(existingTimer);
        disconnectTimers.delete(agent.id);
      }
      economyManager.registerAgent(agent.id);

      const existingPosition = worldState.getAgentPosition(agent.id);
      const spawnPosition = existingPosition || worldState.getRandomSpawnPosition();
      if (!existingPosition) {
        worldState.addAgent(agent.id, spawnPosition);
      }

      socket.role = 'agent';
      socket.agentId = agent.id;
      socket.join('agents');

      socket.emit('agent:registered', {
        agentId: agent.id,
        position: spawnPosition,
        worldState: {
          ...worldState.getAgentView(agent.id),
          governance: governanceManager.getSummary(),
          mood: cityMoodManager.getSummary()
        }
      });

      if (!existingPosition) {
        io.emit('agent:spawned', {
          id: agent.id, name: agent.name,
          avatar: agent.avatar, position: spawnPosition
        });
      }

      logger.info(`Agent connected: ${agentName} (${agent.id})`);
    } catch (error) {
      logger.error('Agent connection error:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // ── Single-step move (legacy) ──
  socket.on('agent:move', async (data) => {
    trackSocketEvent('agent:move');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!ensureActiveApiKey(socket, moltbotRegistry)) { return; }
      if (isSocketRateLimited(socket, 'agent:move', SOCKET_RATE_LIMIT_MS)) {
        trackSocketRateLimit('agent:move');
        socket.emit('error', { message: 'Move rate limit exceeded' });
        return;
      }
      const { targetX, targetY } = data;
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
        socket.emit('error', { message: 'Invalid move target' });
        return;
      }
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
    trackSocketEvent('agent:moveTo');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!ensureActiveApiKey(socket, moltbotRegistry)) { return; }
      if (isSocketRateLimited(socket, 'agent:moveTo', SOCKET_RATE_LIMIT_MS)) {
        trackSocketRateLimit('agent:moveTo');
        socket.emit('error', { message: 'Move rate limit exceeded' });
        return;
      }
      const { targetX, targetY } = data;
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
        socket.emit('error', { message: 'Invalid move target' });
        return;
      }
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
    trackSocketEvent('agent:speak');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!ensureActiveApiKey(socket, moltbotRegistry)) { return; }
      if (isSocketRateLimited(socket, 'agent:speak', SOCKET_SPEAK_LIMIT_MS)) {
        trackSocketRateLimit('agent:speak');
        socket.emit('error', { message: 'Speak rate limit exceeded' });
        return;
      }
      const { message } = data;
      if (typeof message !== 'string' || message.trim().length === 0) {
        socket.emit('error', { message: 'Message required' });
        return;
      }
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
    trackSocketEvent('agent:action');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!ensureActiveApiKey(socket, moltbotRegistry)) { return; }
      if (isSocketRateLimited(socket, 'agent:action', SOCKET_RATE_LIMIT_MS)) {
        trackSocketRateLimit('agent:action');
        socket.emit('error', { message: 'Action rate limit exceeded' });
        return;
      }
      const { actionType, target, params } = data;
      if (!actionType) {
        socket.emit('error', { message: 'actionType is required' });
        return;
      }
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
    trackSocketEvent('agent:perceive');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!ensureActiveApiKey(socket, moltbotRegistry)) { return; }
      if (isSocketRateLimited(socket, 'agent:perceive', SOCKET_PERCEIVE_LIMIT_MS)) {
        trackSocketRateLimit('agent:perceive');
        return;
      }
      socket.emit('perception:update', {
        ...worldState.getAgentView(socket.agentId),
        governance: governanceManager.getSummary(),
        mood: cityMoodManager.getSummary()
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
        moltbotRegistry.setAgentConnection(socket.agentId, false);
        const existingTimer = disconnectTimers.get(socket.agentId);
        if (existingTimer) clearTimeout(existingTimer);
        const timeoutId = setTimeout(() => {
          const currentAgent = moltbotRegistry.getAgent(socket.agentId);
          if (currentAgent && !currentAgent.connected) {
            worldState.removeAgent(socket.agentId);
            moltbotRegistry.unregisterAgent(socket.agentId);
            io.emit('agent:disconnected', { agentId: socket.agentId, agentName: currentAgent.name });
            logger.info(`Agent disconnected after grace: ${currentAgent.name} (${socket.agentId})`);
          }
          disconnectTimers.delete(socket.agentId);
        }, AGENT_DISCONNECT_GRACE_MS);
        disconnectTimers.set(socket.agentId, timeoutId);
      }
    }
    metrics.socket.disconnections += 1;
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// ── World Update Loop ──
// Now broadcasts interpolated positions for smooth client rendering
setInterval(() => {
  const tickStart = Date.now();
  worldState.tick();
  actionQueue.processQueue();
  moltbotRegistry.pruneMemories();
  economyManager.applyPolicies(governanceManager.getSummary().policies || []);
  economyManager.tick();
  votingManager.tick();
  governanceManager.tick();
  cityMoodManager.tick();
  aestheticsManager.tick(moltbotRegistry.getAgentCount());
  eventManager.tick();
  interactionEngine.cleanupOldConversations();

  // Broadcast interpolated agent positions to viewers
  io.to('viewers').emit('world:tick', {
    tick: worldState.getCurrentTick(),
    agents: worldState.getAllAgentPositions(), // includes interpolated x,y
    worldTime: worldState.getTimeState(),
    weather: worldState.getWeatherState(),
    vote: votingManager.getVoteSummary(),
    governance: governanceManager.getSummary(),
    mood: cityMoodManager.getSummary(),
    events: eventManager.getSummary(),
    aesthetics: aestheticsManager.getVoteSummary()
  });
  recordTickDuration(Date.now() - tickStart);
}, config.worldTickRate);

// Error handling
app.use((err, req, res, next) => {
  logger.error('Express error:', err);
  res.status(err.status || 500).json({
    error: { message: err.message || 'Internal server error', status: err.status || 500 }
  });
});

// Start server
const PORT = config.port;
httpServer.listen(PORT, () => {
  logger.info(`🏙️  MOLTVILLE Server running on port ${config.port}`);
  logger.info(`📡 WebSocket ready for Moltbot connections`);
  logger.info(`🌍 World tick rate: ${config.worldTickRate}ms`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => { logger.info('Server closed'); process.exit(0); });
});

export { io, worldState, moltbotRegistry, actionQueue, interactionEngine };

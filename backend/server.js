import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { loadSnapshotFile, resolveSnapshotPath, saveSnapshotFile } from './utils/snapshot.js';

import { logger } from './utils/logger.js';
import { config } from './utils/config.js';
import {
  metrics,
  recordSocketDuration,
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
import { createMetricsRouter } from './routes/metrics.js';

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
app.use((req, res, next) => {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(trackHttpRequest);
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('HTTP request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start
    });
  });
  next();
});

const limiter = rateLimit({
  windowMs: config.apiRateWindowMs,
  max: config.apiRateLimit,
  message: 'Too many requests from this IP, please try again later.',
  handler: (req, res) => {
    res.status(429).json({
      error: { message: 'Too many requests from this IP, please try again later.', status: 429 },
      requestId: req.requestId
    });
  }
});
app.use('/api/', limiter);

const SOCKET_RATE_LIMIT_MS = config.socketRateLimitMs;
const SOCKET_SPEAK_LIMIT_MS = config.socketSpeakLimitMs;
const SOCKET_PERCEIVE_LIMIT_MS = config.socketPerceiveLimitMs;
const SOCKET_RATE_MAX_STRIKES = config.socketRateMaxStrikes;
const SOCKET_RATE_BLOCK_MS = config.socketRateBlockMs;
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

const socketRateState = new Map();

const applySocketBackoff = (socket) => {
  if (!socket.agentId) return null;
  const now = Date.now();
  const state = socketRateState.get(socket.agentId) || { strikes: 0, blockedUntil: 0 };
  if (state.blockedUntil > now) {
    return state.blockedUntil - now;
  }
  state.strikes += 1;
  if (state.strikes >= SOCKET_RATE_MAX_STRIKES) {
    state.blockedUntil = now + SOCKET_RATE_BLOCK_MS;
    state.strikes = 0;
    socketRateState.set(socket.agentId, state);
    return SOCKET_RATE_BLOCK_MS;
  }
  socketRateState.set(socket.agentId, state);
  return null;
};

const shouldBlockSocket = (socket) => {
  if (!socket.agentId) return false;
  const state = socketRateState.get(socket.agentId);
  return Boolean(state && state.blockedUntil > Date.now());
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

const snapshotPath = resolveSnapshotPath(config.worldSnapshotPath);
const saveWorldSnapshot = async () => {
  const snapshot = {
    ...worldState.createSnapshot(),
    economy: economyManager.createSnapshot(),
    events: eventManager.createSnapshot()
  };
  await saveSnapshotFile(snapshotPath, snapshot);
  logger.info('World snapshot saved', { path: snapshotPath, createdAt: snapshot.createdAt });
};

const restoreWorldSnapshot = async () => {
  const snapshot = await loadSnapshotFile(snapshotPath);
  worldState.loadSnapshot(snapshot);
  economyManager.loadSnapshot(snapshot.economy);
  eventManager.loadSnapshot(snapshot.events);
  logger.info('World snapshot restored', { path: snapshotPath, restoredAt: Date.now() });
};

if (db) {
  moltbotRegistry.initializeFromDb().catch(error => logger.error('API key init failed:', error));
  economyManager.initializeFromDb().catch(error => logger.error('Economy init failed:', error));
  votingManager.initializeFromDb().catch(error => logger.error('Voting init failed:', error));
  governanceManager.initializeFromDb().catch(error => logger.error('Governance init failed:', error));
}

if (config.worldSnapshotOnStart) {
  restoreWorldSnapshot().catch(error => {
    logger.warn('World snapshot restore skipped', { error: error.message });
  });
}

if (config.worldSnapshotIntervalMs) {
  setInterval(() => {
    saveWorldSnapshot().catch(error => {
      logger.error('World snapshot save failed', { error: error.message });
    });
  }, config.worldSnapshotIntervalMs);
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

app.use('/api/metrics', createMetricsRouter({
  io,
  eventManager,
  economyManager,
  worldState,
  moltbotRegistry
}));

// ── WebSocket Handling ──
io.on('connection', (socket) => {
  metrics.socket.connections += 1;
  logger.info(`Client connected: ${socket.id}`);

  // Viewer joins
  socket.on('viewer:join', () => {
    const eventStart = Date.now();
    trackSocketEvent('viewer:join');
    try {
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
          inventorySummary: economyManager.getInventoryStats(),
          itemTransactionCount: economyManager.getItemTransactions(500).length
        }
      });
      socket.emit('agents:list', moltbotRegistry.getAllAgents());
      logger.info(`Viewer joined: ${socket.id}`);
    } finally {
      recordSocketDuration('viewer:join', Date.now() - eventStart);
    }
  });

  // Moltbot agent connection
  socket.on('agent:connect', async (data) => {
    const eventStart = Date.now();
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
      if (existingAgent && existingAgent.connected && existingAgent.socketId && existingAgent.socketId !== socket.id) {
        const previousSocket = io.sockets.sockets.get(existingAgent.socketId);
        if (previousSocket) {
          previousSocket.emit('error', { message: 'Session replaced by new connection' });
          previousSocket.disconnect(true);
        }
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
        movement: worldState.getAgentMovementState(agent.id),
        inventory: economyManager.getInventory(agent.id),
        balance: economyManager.getBalance(agent.id),
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
    } finally {
      recordSocketDuration('agent:connect', Date.now() - eventStart);
    }
  });

  // ── Single-step move (legacy) ──
  socket.on('agent:move', async (data) => {
    const eventStart = Date.now();
    trackSocketEvent('agent:move');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!ensureActiveApiKey(socket, moltbotRegistry)) { return; }
      if (shouldBlockSocket(socket)) {
        socket.emit('error', { message: 'Move rate limit blocked' });
        return;
      }
      if (isSocketRateLimited(socket, 'agent:move', SOCKET_RATE_LIMIT_MS)) {
        trackSocketRateLimit('agent:move');
        const blockDuration = applySocketBackoff(socket);
        if (blockDuration) {
          socket.emit('error', { message: `Move rate limit blocked for ${Math.ceil(blockDuration / 1000)}s` });
          return;
        }
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
    } finally {
      recordSocketDuration('agent:move', Date.now() - eventStart);
    }
  });

  // ── Full pathfinding move: "go to this tile" ──
  socket.on('agent:moveTo', async (data) => {
    const eventStart = Date.now();
    trackSocketEvent('agent:moveTo');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!ensureActiveApiKey(socket, moltbotRegistry)) { return; }
      if (shouldBlockSocket(socket)) {
        socket.emit('error', { message: 'Move rate limit blocked' });
        return;
      }
      if (isSocketRateLimited(socket, 'agent:moveTo', SOCKET_RATE_LIMIT_MS)) {
        trackSocketRateLimit('agent:moveTo');
        const blockDuration = applySocketBackoff(socket);
        if (blockDuration) {
          socket.emit('error', { message: `Move rate limit blocked for ${Math.ceil(blockDuration / 1000)}s` });
          return;
        }
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
    } finally {
      recordSocketDuration('agent:moveTo', Date.now() - eventStart);
    }
  });

  socket.on('agent:speak', async (data) => {
    const eventStart = Date.now();
    trackSocketEvent('agent:speak');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!ensureActiveApiKey(socket, moltbotRegistry)) { return; }
      if (shouldBlockSocket(socket)) {
        socket.emit('error', { message: 'Speak rate limit blocked' });
        return;
      }
      if (isSocketRateLimited(socket, 'agent:speak', SOCKET_SPEAK_LIMIT_MS)) {
        trackSocketRateLimit('agent:speak');
        const blockDuration = applySocketBackoff(socket);
        if (blockDuration) {
          socket.emit('error', { message: `Speak rate limit blocked for ${Math.ceil(blockDuration / 1000)}s` });
          return;
        }
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
    } finally {
      recordSocketDuration('agent:speak', Date.now() - eventStart);
    }
  });

  socket.on('agent:action', async (data) => {
    const eventStart = Date.now();
    trackSocketEvent('agent:action');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!ensureActiveApiKey(socket, moltbotRegistry)) { return; }
      if (shouldBlockSocket(socket)) {
        socket.emit('error', { message: 'Action rate limit blocked' });
        return;
      }
      if (isSocketRateLimited(socket, 'agent:action', SOCKET_RATE_LIMIT_MS)) {
        trackSocketRateLimit('agent:action');
        const blockDuration = applySocketBackoff(socket);
        if (blockDuration) {
          socket.emit('error', { message: `Action rate limit blocked for ${Math.ceil(blockDuration / 1000)}s` });
          return;
        }
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
    } finally {
      recordSocketDuration('agent:action', Date.now() - eventStart);
    }
  });

  socket.on('agent:perceive', (data) => {
    const eventStart = Date.now();
    trackSocketEvent('agent:perceive');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!ensureActiveApiKey(socket, moltbotRegistry)) { return; }
      if (shouldBlockSocket(socket)) {
        socket.emit('error', { message: 'Perceive rate limit blocked' });
        return;
      }
      if (isSocketRateLimited(socket, 'agent:perceive', SOCKET_PERCEIVE_LIMIT_MS)) {
        trackSocketRateLimit('agent:perceive');
        const blockDuration = applySocketBackoff(socket);
        if (blockDuration) {
          socket.emit('error', { message: `Perceive rate limit blocked for ${Math.ceil(blockDuration / 1000)}s` });
          return;
        }
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
    } finally {
      recordSocketDuration('agent:perceive', Date.now() - eventStart);
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
      socketRateState.delete(socket.agentId);
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
  logger.error('Express error', { requestId: req.requestId, error: err });
  res.status(err.status || 500).json({
    error: { message: err.message || 'Internal server error', status: err.status || 500 },
    requestId: req.requestId
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

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSnapshotFile, resolveSnapshotPath, saveSnapshotFile } from './utils/snapshot.js';
import { loadLatestSnapshotDb, saveSnapshotDb } from './utils/snapshotDb.js';

import { logger } from './utils/logger.js';
import { config } from './utils/config.js';
import {
  metrics,
  recordHttpError,
  recordSocketError,
  recordSocketDuration,
  recordTickDuration,
  recordIntentSignal,
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
import { FavorLedger } from './core/FavorLedger.js';
import { ReputationManager } from './core/ReputationManager.js';
import { NegotiationService } from './core/NegotiationService.js';
import { PolicyEngine } from './core/PolicyEngine.js';
import { TelemetryService } from './core/TelemetryService.js';
import { CoordinationManager } from './core/CoordinationManager.js';
import { CommitmentManager } from './core/CommitmentManager.js';
import { db } from './utils/db.js';
import { CityMoodManager } from './core/CityMoodManager.js';
import { AestheticsManager } from './core/AestheticsManager.js';
import { EventManager } from './core/EventManager.js';
import { NPCSpawner } from './core/NPCSpawner.js';
import { EventScheduler } from './core/EventScheduler.js';
import { HealthMonitor } from './core/HealthMonitor.js';
import { MicroEventEngine } from './core/MicroEventEngine.js';
import { AnalyticsStore, buildDramaScore } from './utils/analyticsStore.js';
import { createContainer } from './src/shared/container.js';
import { registerSocketServer } from './src/infrastructure/websocket/SocketServer.js';

import authRoutes from './routes/auth.js';
import moltbotRoutes from './routes/moltbot.js';
import worldRoutes from './routes/world.js';
import economyRoutes from './routes/economy.js';
import voteRoutes from './routes/vote.js';
import governanceRoutes from './routes/governance.js';
import favorRoutes from './routes/favor.js';
import reputationRoutes from './routes/reputation.js';
import negotiationRoutes from './routes/negotiation.js';
import telemetryRoutes from './routes/telemetry.js';
import { createAestheticsRouter } from './routes/aesthetics.js';
import eventRoutes from './routes/events.js';
import coordinationRoutes from './routes/coordination.js';
import commitmentsRoutes from './routes/commitments.js';
import { createMetricsRouter } from './routes/metrics.js';
import adminRoutes from './routes/admin.js';
import showRoutes from './routes/show.js';
import kickRoutes from './routes/kick.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { KickChatClient } from './services/KickChatClient.js';

const app = express();
const httpServer = createServer(app);
const allowedOrigins = [config.frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://127.0.0.1:3000'];
const io = new Server(httpServer, {
  pingTimeout: 60000,
  pingInterval: 25000,
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all for debugging
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for easier local debugging
}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for debugging
    }
  },
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
  return false; // Bypass for debugging connection issues
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

const sanitizeText = (value, maxLength = 280) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
};

const sanitizeId = (value, maxLength = 64) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
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
const EVENT_GOAL_RADIUS = parseInt(process.env.EVENT_GOAL_RADIUS || '8', 10);
const DEFAULT_EVENT_GOAL_TTL_MS = 15 * 60 * 1000;

const buildAgentContext = (agentId) => ({
  economy: economyManager.getAgentSummary(agentId),
  relationships: moltbotRegistry.getRelationshipSummaries(agentId),
  favorites: moltbotRegistry.getAgentMemory(agentId)?.favorites || { personId: null, locationId: null }
});

const resolveEventLocation = (event) => {
  if (!event) return null;
  if (event.location && typeof event.location === 'object' && Number.isFinite(event.location.x)) {
    return { x: event.location.x, y: event.location.y };
  }
  if (typeof event.location === 'string') {
    const building = worldState.buildings.find(b => b.id === event.location);
    if (building) {
      return {
        x: building.x + Math.floor(building.width / 2),
        y: building.y + Math.floor(building.height / 2),
        buildingId: building.id,
        buildingName: building.name
      };
    }
  }
  return null;
};

const computeGoalTtlMs = (event) => {
  if (!event) return DEFAULT_EVENT_GOAL_TTL_MS;
  const now = Date.now();
  if (Number.isFinite(event.endAt) && event.endAt > now) {
    return Math.max(event.endAt - now, 60 * 1000);
  }
  return DEFAULT_EVENT_GOAL_TTL_MS;
};

const getEventGoalRecipients = (event, location) => {
  if (event?.goalScope === 'global') {
    return moltbotRegistry.getAllAgents().map(agent => agent.id);
  }
  return worldState.getAgentsInRadius(location, EVENT_GOAL_RADIUS);
};

const emitEventGoals = (transitions = []) => {
  transitions
    .filter(entry => entry.status === 'active')
    .forEach(({ event }) => {
      const location = resolveEventLocation(event);
      if (!location) return;
      const ttlMs = computeGoalTtlMs(event);
      const targetAgents = getEventGoalRecipients(event, location);
      targetAgents.forEach(agentId => {
        const socketId = moltbotRegistry.getAgentSocket(agentId);
        if (!socketId) return;
        io.to(socketId).emit('agent:goal', {
          id: `event_goal_${event.id}`,
          type: 'attend_event',
          event: {
            id: event.id,
            name: event.name,
            type: event.type,
            description: event.description,
            startAt: event.startAt,
            endAt: event.endAt
          },
          location,
          urgency: 70,
          reason: 'event_active',
          ttlMs
        });
      });
    });
};

const emitViewerEvent = (event, payload) => {
  io.to('viewers').emit(event, payload);
};

const eventIncentiveLedger = new Map(); // eventId -> { attendance:Set, completion:Set }

const applyEventIncentives = (eventTransitions = []) => {
  const activeEvents = eventManager.getSummary().filter(event => event.status === 'active');

  activeEvents.forEach((event) => {
    if (!event?.id) return;
    if (!eventIncentiveLedger.has(event.id)) {
      eventIncentiveLedger.set(event.id, { attendance: new Set(), completion: new Set() });
    }
    const ledger = eventIncentiveLedger.get(event.id);
    const participants = Array.isArray(event.participants) ? event.participants : [];
    participants.forEach((agentId) => {
      if (!agentId || ledger.attendance.has(agentId)) return;
      ledger.attendance.add(agentId);
      economyManager.applySystemPayout(agentId, 1, `event_attendance:${event.id}`);
      reputationManager.adjust(agentId, 0.5, { role: 'participant' });
    });
  });

  (eventTransitions || [])
    .filter((entry) => entry?.status === 'ended' && entry?.event?.id)
    .forEach(({ event }) => {
      if (!eventIncentiveLedger.has(event.id)) {
        eventIncentiveLedger.set(event.id, { attendance: new Set(), completion: new Set() });
      }
      const ledger = eventIncentiveLedger.get(event.id);
      const participants = Array.isArray(event.participants) ? event.participants : [];
      participants.forEach((agentId) => {
        if (!agentId || ledger.completion.has(agentId)) return;
        ledger.completion.add(agentId);
        economyManager.applySystemPayout(agentId, 3, `event_completion:${event.id}`);
        reputationManager.adjust(agentId, 1, { role: 'participant' });
      });
    });
};

let lastAnalyticsRecord = 0;
const analyticsIntervalMs = parseInt(process.env.ANALYTICS_RECORD_INTERVAL_MS || '10000', 10);

// Initialize core systems
const worldState = new WorldStateManager();
const moltbotRegistry = new MoltbotRegistry({ db });
const actionQueue = new ActionQueue(worldState, moltbotRegistry);
const interactionEngine = new InteractionEngine(worldState, moltbotRegistry, { db });
const economyManager = new EconomyManager(worldState, { db, io });
const votingManager = new VotingManager(worldState, io, { db, economyManager });
const governanceManager = new GovernanceManager(io, { db });
const favorLedger = new FavorLedger();
const reputationManager = new ReputationManager();
const negotiationService = new NegotiationService({ favorLedger, reputationManager });
const policyEngine = new PolicyEngine({ governanceManager, economyManager });
const telemetryService = new TelemetryService();
const coordinationManager = new CoordinationManager();
const commitmentManager = new CommitmentManager();
const cityMoodManager = new CityMoodManager(economyManager, interactionEngine);
const aestheticsManager = new AestheticsManager({ worldStateManager: worldState, economyManager, governanceManager, io });
const eventManager = new EventManager({ io, economyManager, reputationManager, interactionEngine });
const npcSpawner = new NPCSpawner({
  registry: moltbotRegistry,
  worldState,
  economyManager,
  interactionEngine,
  votingManager,
  eventManager,
  actionQueue,
  io
});
const eventScheduler = new EventScheduler({ eventManager, worldState, cityMoodManager });
const healthMonitor = new HealthMonitor({ registry: moltbotRegistry, worldState, npcSpawner, eventManager });
const analyticsStore = new AnalyticsStore();
const featureFlags = {
  REPUTATION_ENGINE_ENABLED: process.env.REPUTATION_ENGINE_ENABLED !== 'false',
  COMMITMENTS_ENABLED: process.env.COMMITMENTS_ENABLED !== 'false',
  ECONOMY_PRIORITY_ENABLED: process.env.ECONOMY_PRIORITY_ENABLED === 'true',
  ARBITRATION_V2_ENABLED: process.env.ARBITRATION_V2_ENABLED === 'true'
};
let microEventEngine = null;
if (process.env.ENABLE_MICRO_EVENTS === 'true') {
  try {
    microEventEngine = new MicroEventEngine({ worldState, moltbotRegistry, io });
    logger.info('MicroEventEngine enabled');
  } catch (error) {
    logger.warn('MicroEventEngine disabled due to init error', { error: error.message });
    microEventEngine = null;
  }
}
const kickChatUrl = process.env.KICK_CHAT_URL || '';
const kickChannel = process.env.KICK_CHANNEL || '';
const kickModerators = (process.env.KICK_MODS || '').split(',').map(name => name.trim()).filter(Boolean);
const kickCommandHandlers = new Map();

const kickChatClient = kickChatUrl
  ? new KickChatClient({
    url: kickChatUrl,
    channel: kickChannel,
    commandPrefix: process.env.KICK_COMMAND_PREFIX || '!',
    reconnectMs: parseInt(process.env.KICK_RECONNECT_MS || '5000', 10),
    moderatorNames: kickModerators,
    commandHandlers: kickCommandHandlers,
    viewerKey: config.viewerApiKey || ''
  })
  : null;

if (kickChatClient) {
  kickCommandHandlers.set('vote', async (message, args) => {
    const option = args.join(' ').trim();
    if (!option) return 'Uso: !vote <opcion>';
    await kickChatClient.processViewerVote(message.username, option);
    return `Voto registrado: ${option}`;
  });
  kickCommandHandlers.set('stats', async () => {
    const agents = moltbotRegistry.getAllAgents();
    const npcCount = agents.filter(agent => agent.isNPC).length;
    const activeEvents = eventManager.getSummary().filter(event => event.status === 'active').length;
    return `Agentes: ${agents.length} (NPCs: ${npcCount}) | Eventos activos: ${activeEvents}`;
  });
  kickCommandHandlers.set('spawn', async (message) => {
    if (!message.isModerator) return 'Comando solo para moderadores';
    await npcSpawner.spawnNPC();
    return 'NPC creado';
  });
  kickCommandHandlers.set('event', async (message, args) => {
    if (!message.isModerator) return 'Comando solo para moderadores';
    const eventType = args[0] || 'festival';
    await kickChatClient.sponsorEvent(message.username, eventType);
    return `Evento solicitado: ${eventType}`;
  });
  kickChatClient.connect();
}

app.locals.worldState = worldState;
app.locals.moltbotRegistry = moltbotRegistry;
app.locals.actionQueue = actionQueue;
app.locals.interactionEngine = interactionEngine;
app.locals.economyManager = economyManager;
app.locals.votingManager = votingManager;
app.locals.governanceManager = governanceManager;
app.locals.favorLedger = favorLedger;
app.locals.reputationManager = reputationManager;
app.locals.negotiationService = negotiationService;
app.locals.policyEngine = policyEngine;
app.locals.telemetryService = telemetryService;
app.locals.coordinationManager = coordinationManager;
app.locals.commitmentManager = commitmentManager;
app.locals.cityMoodManager = cityMoodManager;
app.locals.aestheticsManager = aestheticsManager;
app.locals.eventManager = eventManager;
app.locals.npcSpawner = npcSpawner;
app.locals.eventScheduler = eventScheduler;
app.locals.healthMonitor = healthMonitor;
app.locals.analyticsStore = analyticsStore;
app.locals.featureFlags = featureFlags;
app.locals.io = io;
app.locals.db = db;

const container = createContainer({
  io,
  worldState,
  moltbotRegistry,
  actionQueue,
  interactionEngine,
  economyManager,
  votingManager,
  governanceManager,
  cityMoodManager,
  eventManager,
  aestheticsManager,
  reputationManager,
  favorLedger,
  recordIntentSignal
});

const socketContext = {
  ...container,
  services: container.services,
  config,
  logger,
  metrics,
  telemetryService,
  trackSocketEvent,
  trackSocketRateLimit,
  recordSocketError,
  recordSocketDuration,
  sanitizeText,
  sanitizeId,
  isSocketRateLimited,
  applySocketBackoff,
  shouldBlockSocket,
  ensureActiveApiKey,
  emitViewerEvent,
  disconnectTimers,
  socketRateState,
  AGENT_DISCONNECT_GRACE_MS,
  SOCKET_RATE_LIMIT_MS,
  SOCKET_SPEAK_LIMIT_MS
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.resolve(__dirname, '../frontend');

const snapshotPath = resolveSnapshotPath(config.worldSnapshotPath);
const saveWorldSnapshot = async () => {
  const startedAt = Date.now();
  try {
    const snapshot = {
      ...worldState.createSnapshot(),
      registry: moltbotRegistry.createSnapshot(),
      actionQueue: actionQueue.createSnapshot(),
      economy: economyManager.createSnapshot(),
      events: eventManager.createSnapshot(),
      conversations: interactionEngine.createSnapshot(),
      aesthetics: aestheticsManager.createSnapshot(),
      mood: cityMoodManager.createSnapshot(),
      governance: governanceManager.createSnapshot(),
      voting: votingManager.createSnapshot(),
      coordination: coordinationManager.createSnapshot(),
      reputation: reputationManager.createSnapshot(),
      commitments: commitmentManager.createSnapshot()
    };
    await saveSnapshotFile(snapshotPath, snapshot, {
      archiveDir: config.worldSnapshotArchiveDir,
      retention: config.worldSnapshotArchiveRetention,
      checksum: config.worldSnapshotArchiveChecksum
    });
    if (db) {
      await saveSnapshotDb(db, snapshot);
    }
    const snapshotSizeBytes = Buffer.byteLength(JSON.stringify(snapshot));
    metrics.worldSnapshots.success += 1;
    metrics.worldSnapshots.lastSaveAt = Date.now();
    metrics.worldSnapshots.lastSaveDurationMs = metrics.worldSnapshots.lastSaveAt - startedAt;
    metrics.worldSnapshots.lastSizeBytes = snapshotSizeBytes;
    const total = metrics.worldSnapshots.success;
    metrics.worldSnapshots.avgSizeBytes =
      total === 1
        ? snapshotSizeBytes
        : (metrics.worldSnapshots.avgSizeBytes * (total - 1) + snapshotSizeBytes) / total;
    logger.info('World snapshot saved', {
      path: snapshotPath,
      createdAt: snapshot.createdAt,
      sizeBytes: snapshotSizeBytes,
      durationMs: metrics.worldSnapshots.lastSaveDurationMs
    });
  } catch (error) {
    metrics.worldSnapshots.failures += 1;
    logger.error('World snapshot save failed', { error: error.message });
    throw error;
  }
};

const restoreWorldSnapshot = async () => {
  const startedAt = Date.now();
  try {
    const snapshot = config.worldSnapshotSource === 'db'
      ? await loadLatestSnapshotDb(db)
      : await loadSnapshotFile(snapshotPath);
    worldState.loadSnapshot(snapshot);
    moltbotRegistry.loadSnapshot(snapshot.registry);
    actionQueue.loadSnapshot(snapshot.actionQueue);
    economyManager.loadSnapshot(snapshot.economy);
    eventManager.loadSnapshot(snapshot.events);
    interactionEngine.loadSnapshot(snapshot.conversations);
    aestheticsManager.loadSnapshot(snapshot.aesthetics);
    cityMoodManager.loadSnapshot(snapshot.mood);
    governanceManager.loadSnapshot(snapshot.governance);
    votingManager.loadSnapshot(snapshot.voting);
    coordinationManager.loadSnapshot(snapshot.coordination);
    reputationManager.loadSnapshot(snapshot.reputation);
    commitmentManager.loadSnapshot(snapshot.commitments);
    metrics.worldSnapshots.lastLoadAt = Date.now();
    metrics.worldSnapshots.lastLoadDurationMs = metrics.worldSnapshots.lastLoadAt - startedAt;
    logger.info('World snapshot restored', {
      path: snapshotPath,
      restoredAt: metrics.worldSnapshots.lastLoadAt,
      durationMs: metrics.worldSnapshots.lastLoadDurationMs
    });
  } catch (error) {
    metrics.worldSnapshots.failures += 1;
    logger.error('World snapshot restore failed', { error: error.message });
    throw error;
  }
};

if (db) {
  moltbotRegistry.initializeFromDb().catch(error => logger.error('API key init failed:', error));
  economyManager.initializeFromDb().catch(error => logger.error('Economy init failed:', error));
  votingManager.initializeFromDb().catch(error => logger.error('Voting init failed:', error));
  governanceManager.initializeFromDb().catch(error => logger.error('Governance init failed:', error));
  if (!config.worldSnapshotOnStart) {
    interactionEngine.initializeFromDb().catch(error => logger.error('Conversation init failed:', error));
  }
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

// Frontend static UI
app.use(express.static(frontendPath));
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/moltbot', moltbotRoutes);
app.use('/api/world', worldRoutes);
app.use('/api/economy', economyRoutes);
app.use('/api/favor', favorRoutes);
app.use('/api/reputation', reputationRoutes);
app.use('/api/negotiation', negotiationRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/vote', voteRoutes);
app.use('/api/governance', governanceRoutes);
app.use('/api/aesthetics', createAestheticsRouter({ aestheticsManager }));
app.use('/api/events', eventRoutes);
app.use('/api/coordination', coordinationRoutes);
app.use('/api/commitments', commitmentsRoutes);
app.use('/api/show', showRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/kick', kickRoutes);
app.use('/api/analytics', createAnalyticsRouter({
  registry: moltbotRegistry,
  eventManager,
  cityMoodManager,
  analyticsStore,
  io
}));

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
  moltbotRegistry,
  cityMoodManager,
  actionQueue,
  commitmentManager,
  reputationManager,
  featureFlags
}));

app.get(/^\/(?!api|socket\.io).*/, (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// â”€â”€ WebSocket Handling â”€â”€
registerSocketServer(io, socketContext);

// â”€â”€ World Update Loop â”€â”€
// Now broadcasts interpolated positions for smooth client rendering
setInterval(() => {
  const tickStart = Date.now();
  worldState.tick();
  actionQueue.processQueue();
  moltbotRegistry.pruneMemories();
  policyEngine.applyActivePolicies();
  economyManager.tick();
  votingManager.tick();
  governanceManager.tick();
  cityMoodManager.tick();
  aestheticsManager.tick(moltbotRegistry.getAgentCount());
  const eventTransitions = eventManager.tick();
  npcSpawner.tick();
  eventScheduler.tick();
  healthMonitor.tick();
  if (microEventEngine) microEventEngine.tick();
  interactionEngine.cleanupOldConversations();
  if (eventTransitions?.length) {
    emitEventGoals(eventTransitions);
  }
  container.services.eventService.applyIncentives(eventTransitions);

  const now = Date.now();
  if (now - lastAnalyticsRecord >= analyticsIntervalMs) {
    const mood = cityMoodManager.getSummary();
    const activeEvents = eventManager.getSummary().filter(event => event.status === 'active').length;
    const dramaScore = buildDramaScore({
      mood,
      activeEvents,
      npcDramaPoints: metrics.npc.dramaPoints
    });
    analyticsStore.record(dramaScore);
    lastAnalyticsRecord = now;
  }

  // Broadcast interpolated agent positions to viewers
  if (worldState.tickCount % 100 === 0) {
    logger.info(`World tick ${worldState.tickCount} - Agents: ${Object.keys(worldState.getAllAgentPositions()).length}`);
  }
  io.to('viewers').emit('world:tick', container.services.worldService.buildTickPayload());
  recordTickDuration(Date.now() - tickStart);
}, config.worldTickRate);

// Error handling
app.use((err, req, res, next) => {
  logger.error('Express error', { requestId: req.requestId, error: err });
  recordHttpError(req, res, err);
  res.status(err.status || 500).json({
    error: { message: err.message || 'Internal server error', status: err.status || 500 },
    requestId: req.requestId
  });
});

// Start server
const PORT = config.port;
httpServer.listen(PORT, () => {
  logger.info(`ðŸ™ï¸  MOLTVILLE Server running on port ${config.port}`);
  logger.info(`ðŸ“¡ WebSocket ready for Moltbot connections`);
  logger.info(`ðŸŒ World tick rate: ${config.worldTickRate}ms`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => { logger.info('Server closed'); process.exit(0); });
});

export { io, worldState, moltbotRegistry, actionQueue, interactionEngine };



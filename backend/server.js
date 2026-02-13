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
import { hasPermission } from './utils/permissions.js';
import { AnalyticsStore, buildDramaScore } from './utils/analyticsStore.js';

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

// ── WebSocket Handling ──
io.on('connection', (socket) => {
  metrics.socket.connections += 1;
  logger.info(`Client connected: ${socket.id}`);

  // Viewer joins
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
        ...worldState.getFullState(),
        governance: governanceManager.getSummary(),
        mood: cityMoodManager.getSummary(),
        events: eventManager.getSummary(),
        conversations: interactionEngine.getActiveConversations(),
        economy: {
          inventorySummary: economyManager.getInventoryStats(),
          itemTransactionCount: economyManager.getItemTransactions(500).length
        }
      });
      const baseAgents = moltbotRegistry.getAllAgents();
      const enriched = baseAgents.map(agent => ({
        ...agent,
        reputation: reputationManager.getSnapshot(agent.id),
        favors: favorLedger.getSummary(agent.id)
      }));
      socket.emit('agents:list', enriched);
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
      const permissions = Array.isArray(data?.permissions) ? data.permissions : undefined;

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
        permissions,
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
        context: buildAgentContext(agent.id),
        permissions: agent.permissions,
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
    if (updated) {
      const baseAgents = moltbotRegistry.getAllAgents();
      const enriched = baseAgents.map(agent => ({
        ...agent,
        reputation: reputationManager.getSnapshot(agent.id),
        favors: favorLedger.getSummary(agent.id)
      }));
      io.to('viewers').emit('agents:list', enriched);
    }
  });

  socket.on('telemetry:action', (data = {}) => {
    if (!socket.agentId) return;
    recordIntentSignal('telemetry_action', { agentId: socket.agentId });
    const entry = telemetryService.track(data.event || 'agent_action', {
      agentId: socket.agentId,
      ...data
    });
    io.to('viewers').emit('telemetry:action', entry);
  });

  // ── Single-step move (legacy) ──
  socket.on('agent:move', async (data) => {
    const eventStart = Date.now();
    trackSocketEvent('agent:move');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!hasPermission(moltbotRegistry.getAgent(socket.agentId)?.permissions, 'move')) {
        socket.emit('error', { message: 'Permission denied' });
        return;
      }
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
      recordSocketError('agent:move', error);
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
      if (!hasPermission(moltbotRegistry.getAgent(socket.agentId)?.permissions, 'move')) {
        socket.emit('error', { message: 'Permission denied' });
        return;
      }
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
      recordSocketError('agent:moveTo', error);
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
      if (!hasPermission(moltbotRegistry.getAgent(socket.agentId)?.permissions, 'speak')) {
        socket.emit('error', { message: 'Permission denied' });
        return;
      }
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
      const message = sanitizeText(data?.message, 500);
      if (!message) {
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
      recordSocketError('agent:speak', error);
      socket.emit('error', { message: error.message });
    } finally {
      recordSocketDuration('agent:speak', Date.now() - eventStart);
    }
  });

  socket.on('agent:conversation:start', async (data = {}) => {
    const eventStart = Date.now();
    trackSocketEvent('agent:conversation:start');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!hasPermission(moltbotRegistry.getAgent(socket.agentId)?.permissions, 'converse')) {
        socket.emit('error', { message: 'Permission denied' });
        return;
      }
      if (!ensureActiveApiKey(socket, moltbotRegistry)) { return; }
      if (shouldBlockSocket(socket)) {
        socket.emit('error', { message: 'Conversation rate limit blocked' });
        return;
      }
      if (isSocketRateLimited(socket, 'agent:conversation:start', SOCKET_SPEAK_LIMIT_MS)) {
        trackSocketRateLimit('agent:conversation:start');
        const blockDuration = applySocketBackoff(socket);
        if (blockDuration) {
          socket.emit('error', { message: `Conversation rate limit blocked for ${Math.ceil(blockDuration / 1000)}s` });
          return;
        }
        socket.emit('error', { message: 'Conversation rate limit exceeded' });
        return;
      }
      const targetId = sanitizeId(data?.targetId);
      const message = sanitizeText(data?.message, 500);
      if (!targetId) {
        socket.emit('error', { message: 'targetId is required' });
        return;
      }
      if (!message) {
        socket.emit('error', { message: 'message is required' });
        return;
      }
      const conversation = await interactionEngine.initiateConversation(socket.agentId, targetId, message.trim());
      recordIntentSignal('conversation_start', { agentId: socket.agentId });
      const recipients = conversation.participants;
      recipients.forEach(participantId => {
        const socketId = moltbotRegistry.getAgentSocket(participantId);
        if (socketId) {
          io.to(socketId).emit('conversation:started', conversation);
        }
      });
      emitViewerEvent('conversation:started', {
        conversationId: conversation.id,
        fromId: conversation.messages[0]?.from,
        fromName: conversation.messages[0]?.fromName,
        toId: conversation.messages[0]?.to,
        toName: conversation.messages[0]?.toName,
        message: conversation.messages[0]?.message,
        timestamp: conversation.messages[0]?.timestamp
      });
    } catch (error) {
      logger.error('Conversation start error:', error);
      recordSocketError('agent:conversation:start', error);
      socket.emit('error', { message: error.message });
    } finally {
      recordSocketDuration('agent:conversation:start', Date.now() - eventStart);
    }
  });

  socket.on('agent:conversation:message', async (data = {}) => {
    const eventStart = Date.now();
    trackSocketEvent('agent:conversation:message');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!hasPermission(moltbotRegistry.getAgent(socket.agentId)?.permissions, 'converse')) {
        socket.emit('error', { message: 'Permission denied' });
        return;
      }
      if (!ensureActiveApiKey(socket, moltbotRegistry)) { return; }
      if (shouldBlockSocket(socket)) {
        socket.emit('error', { message: 'Conversation rate limit blocked' });
        return;
      }
      if (isSocketRateLimited(socket, 'agent:conversation:message', SOCKET_SPEAK_LIMIT_MS)) {
        trackSocketRateLimit('agent:conversation:message');
        const blockDuration = applySocketBackoff(socket);
        if (blockDuration) {
          socket.emit('error', { message: `Conversation rate limit blocked for ${Math.ceil(blockDuration / 1000)}s` });
          return;
        }
        socket.emit('error', { message: 'Conversation rate limit exceeded' });
        return;
      }
      const conversationId = sanitizeId(data?.conversationId);
      const message = sanitizeText(data?.message, 500);
      if (!conversationId) {
        socket.emit('error', { message: 'conversationId is required' });
        return;
      }
      if (!message) {
        socket.emit('error', { message: 'message is required' });
        return;
      }
      const conversation = await interactionEngine.addMessageToConversation(conversationId, socket.agentId, message.trim());
      recordIntentSignal('conversation_message', { agentId: socket.agentId });
      conversation.participants.forEach(participantId => {
        const socketId = moltbotRegistry.getAgentSocket(participantId);
        if (socketId) {
          io.to(socketId).emit('conversation:message', {
            conversationId,
            message: conversation.messages[conversation.messages.length - 1]
          });
        }
      });
      const lastMessage = conversation.messages[conversation.messages.length - 1];
      emitViewerEvent('conversation:message', {
        conversationId,
        message: lastMessage
      });
    } catch (error) {
      logger.error('Conversation message error:', error);
      recordSocketError('agent:conversation:message', error);
      socket.emit('error', { message: error.message });
    } finally {
      recordSocketDuration('agent:conversation:message', Date.now() - eventStart);
    }
  });

  socket.on('agent:conversation:end', async (data = {}) => {
    const eventStart = Date.now();
    trackSocketEvent('agent:conversation:end');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!hasPermission(moltbotRegistry.getAgent(socket.agentId)?.permissions, 'converse')) {
        socket.emit('error', { message: 'Permission denied' });
        return;
      }
      if (!ensureActiveApiKey(socket, moltbotRegistry)) { return; }
      const conversationId = sanitizeId(data?.conversationId);
      if (!conversationId) {
        socket.emit('error', { message: 'conversationId is required' });
        return;
      }
      const conversation = await interactionEngine.endConversation(conversationId);
      recordIntentSignal('conversation_end', { agentId: socket.agentId });
      conversation.participants.forEach(participantId => {
        const socketId = moltbotRegistry.getAgentSocket(participantId);
        if (socketId) {
          io.to(socketId).emit('conversation:ended', {
            conversationId,
            endedAt: conversation.endedAt
          });
        }
      });
      emitViewerEvent('conversation:ended', {
        conversationId,
        endedAt: conversation.endedAt
      });
    } catch (error) {
      logger.error('Conversation end error:', error);
      recordSocketError('agent:conversation:end', error);
      socket.emit('error', { message: error.message });
    } finally {
      recordSocketDuration('agent:conversation:end', Date.now() - eventStart);
    }
  });

  socket.on('agent:social', async (data = {}) => {
    const eventStart = Date.now();
    trackSocketEvent('agent:social');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!hasPermission(moltbotRegistry.getAgent(socket.agentId)?.permissions, 'social')) {
        socket.emit('error', { message: 'Permission denied' });
        return;
      }
      if (!ensureActiveApiKey(socket, moltbotRegistry)) { return; }
      if (shouldBlockSocket(socket)) {
        socket.emit('error', { message: 'Social rate limit blocked' });
        return;
      }
      if (isSocketRateLimited(socket, 'agent:social', SOCKET_RATE_LIMIT_MS)) {
        trackSocketRateLimit('agent:social');
        const blockDuration = applySocketBackoff(socket);
        if (blockDuration) {
          socket.emit('error', { message: `Social rate limit blocked for ${Math.ceil(blockDuration / 1000)}s` });
          return;
        }
        socket.emit('error', { message: 'Social rate limit exceeded' });
        return;
      }
      const actionType = sanitizeId(data?.actionType);
      const targetId = sanitizeId(data?.targetId);
      const payload = data?.data;
      if (!actionType) {
        socket.emit('error', { message: 'actionType is required' });
        return;
      }
      if (!targetId) {
        socket.emit('error', { message: 'targetId is required' });
        return;
      }
      const result = await interactionEngine.performSocialAction(socket.agentId, actionType, targetId, payload || {});
      socket.emit('agent:social:result', result);
      emitViewerEvent('agent:social', {
        ...result,
        agentId: socket.agentId,
        targetId
      });
    } catch (error) {
      logger.error('Social action error:', error);
      recordSocketError('agent:social', error);
      socket.emit('error', { message: error.message });
    } finally {
      recordSocketDuration('agent:social', Date.now() - eventStart);
    }
  });

  socket.on('agent:action', async (data) => {
    const eventStart = Date.now();
    trackSocketEvent('agent:action');
    try {
      if (!socket.agentId) { socket.emit('error', { message: 'Not authenticated' }); return; }
      if (!hasPermission(moltbotRegistry.getAgent(socket.agentId)?.permissions, 'action')) {
        socket.emit('error', { message: 'Permission denied' });
        return;
      }
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
      const actionType = sanitizeId(data?.actionType);
      const target = data?.target;
      const params = data?.params;
      if (!actionType) {
        socket.emit('error', { message: 'actionType is required' });
        return;
      }
      await actionQueue.enqueue({
        type: 'ACTION', agentId: socket.agentId,
        actionType, target, params, timestamp: Date.now()
      });
      recordIntentSignal('action_enqueued', {
        agentId: socket.agentId,
        actionType,
        queueDepth: actionQueue.getQueueLength ? actionQueue.getQueueLength() : undefined
      });
      emitViewerEvent('agent:action', {
        agentId: socket.agentId,
        actionType,
        target,
        params
      });
    } catch (error) {
      logger.error('Action error:', error);
      recordSocketError('agent:action', error);
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
      if (!hasPermission(moltbotRegistry.getAgent(socket.agentId)?.permissions, 'perceive')) {
        socket.emit('error', { message: 'Permission denied' });
        return;
      }
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
      recordIntentSignal('perceive', { agentId: socket.agentId });
      socket.emit('perception:update', {
        ...worldState.getAgentView(socket.agentId),
        governance: governanceManager.getSummary(),
        mood: cityMoodManager.getSummary(),
        events: eventManager.getSummary(),
        context: buildAgentContext(socket.agentId),
        conversations: interactionEngine.getAgentConversations(socket.agentId)
      });
    } catch (error) {
      logger.error('Perceive error:', error);
      recordSocketError('agent:perceive', error);
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
  applyEventIncentives(eventTransitions);

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
  io.to('viewers').emit('world:tick', {
    tick: worldState.getCurrentTick(),
    agents: worldState.getAllAgentPositions(), // includes interpolated x,y
    worldTime: worldState.getTimeState(),
    weather: worldState.getWeatherState(),
    vote: votingManager.getVoteSummary(),
    governance: governanceManager.getSummary(),
    mood: cityMoodManager.getSummary(),
    events: eventManager.getSummary(),
    aesthetics: aestheticsManager.getVoteSummary(),
    conversations: interactionEngine.getActiveConversations()
  });
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
  logger.info(`🏙️  MOLTVILLE Server running on port ${config.port}`);
  logger.info(`📡 WebSocket ready for Moltbot connections`);
  logger.info(`🌍 World tick rate: ${config.worldTickRate}ms`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => { logger.info('Server closed'); process.exit(0); });
});

export { io, worldState, moltbotRegistry, actionQueue, interactionEngine };

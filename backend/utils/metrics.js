const buildCounter = () => Object.create(null);

export const metrics = {
  startTime: Date.now(),
  http: {
    total: 0,
    byMethod: buildCounter(),
    byStatus: buildCounter(),
    byRoute: buildCounter()
  },
  errors: {
    http: {
      total: 0,
      byStatus: buildCounter(),
      byRoute: buildCounter(),
      byMessage: buildCounter()
    },
    socket: {
      total: 0,
      byEvent: buildCounter(),
      byMessage: buildCounter()
    }
  },
  socket: {
    connections: 0,
    disconnections: 0,
    events: buildCounter(),
    rateLimited: buildCounter(),
    latency: {
      byEvent: Object.create(null)
    }
  },
  world: {
    ticks: 0,
    lastTickMs: 0,
    avgTickMs: 0
  },
  population: {
    total: 0,
    real: 0,
    npc: 0
  },
  npc: {
    active: 0,
    spawned: 0,
    despawned: 0,
    dramaPoints: 0
  },
  health: {
    lastCheckAt: null,
    lowPopulationEvents: 0,
    highTickLatencyEvents: 0,
    circuitOpened: 0,
    circuitHalfOpen: 0
  },
  performance: {
    latencyBudgetMs: 100,
    tickBudgetExceeded: 0
  },
  worldSnapshots: {
    success: 0,
    failures: 0,
    lastSaveAt: null,
    lastLoadAt: null,
    lastSaveDurationMs: null,
    lastLoadDurationMs: null,
    lastSizeBytes: null,
    avgSizeBytes: 0
  },
  intent: {
    decisions: 0,
    profileUpdates: 0,
    telemetryActions: 0,
    perceiveCalls: 0,
    conversationStarts: 0,
    conversationMessages: 0,
    conversationEnds: 0,
    actionsEnqueued: 0,
    actionTypes: buildCounter(),
    byAgent: buildCounter(),
    queueDepthLast: 0,
    queueDepthMax: 0,
    lastAt: null
  }
};

export const trackHttpRequest = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    metrics.http.total += 1;
    const method = req.method || 'UNKNOWN';
    const status = String(res.statusCode || 0);
    const route = (req.baseUrl || '') + (req.route?.path || req.path || '');
    metrics.http.byMethod[method] = (metrics.http.byMethod[method] || 0) + 1;
    metrics.http.byStatus[status] = (metrics.http.byStatus[status] || 0) + 1;
    metrics.http.byRoute[route] = (metrics.http.byRoute[route] || 0) + 1;
    metrics.http.lastDurationMs = Date.now() - start;
    if (res.statusCode >= 400) {
      metrics.errors.http.total += 1;
      metrics.errors.http.byStatus[status] = (metrics.errors.http.byStatus[status] || 0) + 1;
      metrics.errors.http.byRoute[route] = (metrics.errors.http.byRoute[route] || 0) + 1;
    }
  });
  next();
};

export const trackSocketEvent = (eventName) => {
  metrics.socket.events[eventName] = (metrics.socket.events[eventName] || 0) + 1;
};

export const trackSocketRateLimit = (eventName) => {
  metrics.socket.rateLimited[eventName] = (metrics.socket.rateLimited[eventName] || 0) + 1;
};

export const recordSocketDuration = (eventName, durationMs) => {
  const bucket = metrics.socket.latency.byEvent;
  const existing = bucket[eventName] || { count: 0, avgMs: 0, lastMs: 0, maxMs: 0 };
  const nextCount = existing.count + 1;
  const nextAvg =
    existing.count === 0
      ? durationMs
      : (existing.avgMs * existing.count + durationMs) / nextCount;
  bucket[eventName] = {
    count: nextCount,
    avgMs: nextAvg,
    lastMs: durationMs,
    maxMs: Math.max(existing.maxMs, durationMs)
  };
};

export const recordHttpError = (req, res, error) => {
  if (!error) return;
  const message = error.message || 'Unknown error';
  metrics.errors.http.byMessage[message] = (metrics.errors.http.byMessage[message] || 0) + 1;
};

export const recordSocketError = (eventName, error) => {
  if (!error) return;
  const message = typeof error === 'string' ? error : (error.message || 'Unknown error');
  metrics.errors.socket.total += 1;
  metrics.errors.socket.byEvent[eventName] = (metrics.errors.socket.byEvent[eventName] || 0) + 1;
  metrics.errors.socket.byMessage[message] = (metrics.errors.socket.byMessage[message] || 0) + 1;
};

export const recordTickDuration = (durationMs) => {
  metrics.world.ticks += 1;
  metrics.world.lastTickMs = durationMs;
  metrics.world.avgTickMs =
    metrics.world.avgTickMs === 0
      ? durationMs
      : (metrics.world.avgTickMs * (metrics.world.ticks - 1) + durationMs) / metrics.world.ticks;
  if (durationMs > metrics.performance.latencyBudgetMs) {
    metrics.performance.tickBudgetExceeded += 1;
  }
};


export const recordIntentSignal = (kind, payload = {}) => {
  const intent = metrics.intent;
  intent.lastAt = Date.now();
  const agentId = payload.agentId || payload.id;
  if (agentId) {
    intent.byAgent[agentId] = (intent.byAgent[agentId] || 0) + 1;
  }
  switch (kind) {
    case 'decision':
      intent.decisions += 1;
      break;
    case 'profile_update':
      intent.profileUpdates += 1;
      break;
    case 'telemetry_action':
      intent.telemetryActions += 1;
      break;
    case 'perceive':
      intent.perceiveCalls += 1;
      break;
    case 'conversation_start':
      intent.conversationStarts += 1;
      break;
    case 'conversation_message':
      intent.conversationMessages += 1;
      break;
    case 'conversation_end':
      intent.conversationEnds += 1;
      break;
    case 'action_enqueued':
      intent.actionsEnqueued += 1;
      if (payload.actionType) {
        intent.actionTypes[payload.actionType] = (intent.actionTypes[payload.actionType] || 0) + 1;
      }
      if (Number.isFinite(payload.queueDepth)) {
        intent.queueDepthLast = payload.queueDepth;
        intent.queueDepthMax = Math.max(intent.queueDepthMax || 0, payload.queueDepth);
      }
      break;
    default:
      break;
  }
};

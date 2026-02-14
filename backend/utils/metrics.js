const buildCounter = () => Object.create(null);
const SAMPLE_WINDOW = 500;
const JITTER_WINDOW = 100;
const RECONNECTION_WINDOW_MS = 60 * 1000;

const appendSample = (bucket, value, max = SAMPLE_WINDOW) => {
  if (!Number.isFinite(value)) return;
  bucket.push(value);
  if (bucket.length > max) {
    bucket.splice(0, bucket.length - max);
  }
};

const average = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const stdDev = (values) => {
  if (!values.length) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
};

const percentile = (values, target) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((target / 100) * sorted.length) - 1)
  );
  return sorted[index];
};

const classifyKpi = (value, { green, yellow }, descending = false) => {
  if (!Number.isFinite(value)) return 'unknown';
  if (descending) {
    if (value > green) return 'green';
    if (value >= yellow) return 'yellow';
    return 'red';
  }
  if (value < green) return 'green';
  if (value <= yellow) return 'yellow';
  return 'red';
};

const tickDurationSamples = [];
const tickIntervalSamples = [];
const socketLatencySamples = [];
const eventsPerTickSamples = [];
const recentReconnections = [];

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
    reconnections: 0,
    reconnectionsPerMin: 0,
    lastConnectionAt: null,
    lastDisconnectionAt: null,
    lastReconnectionAt: null,
    events: buildCounter(),
    rateLimited: buildCounter(),
    latency: {
      byEvent: Object.create(null)
    }
  },
  world: {
    ticks: 0,
    lastTickMs: 0,
    avgTickMs: 0,
    lastTickAt: null,
    eventsPerTickLast: 0,
    eventsPerTickAvg: 0
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
    tickBudgetExceeded: 0,
    tickP95Ms: 0,
    tickP99Ms: 0,
    wsLatencyP95Ms: 0,
    tickJitterPct: 0
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
  appendSample(socketLatencySamples, durationMs);
  metrics.performance.wsLatencyP95Ms = percentile(socketLatencySamples, 95);
};

const updateReconnectionsPerMinute = () => {
  const now = Date.now();
  while (recentReconnections.length && recentReconnections[0] < now - RECONNECTION_WINDOW_MS) {
    recentReconnections.shift();
  }
  metrics.socket.reconnectionsPerMin = recentReconnections.length;
};

export const recordSocketConnection = () => {
  metrics.socket.connections += 1;
  metrics.socket.lastConnectionAt = Date.now();
  updateReconnectionsPerMinute();
};

export const recordSocketDisconnection = () => {
  metrics.socket.disconnections += 1;
  metrics.socket.lastDisconnectionAt = Date.now();
  updateReconnectionsPerMinute();
};

export const recordSocketReconnection = () => {
  const now = Date.now();
  metrics.socket.reconnections += 1;
  metrics.socket.lastReconnectionAt = now;
  recentReconnections.push(now);
  updateReconnectionsPerMinute();
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
  appendSample(tickDurationSamples, durationMs);
  metrics.performance.tickP95Ms = percentile(tickDurationSamples, 95);
  metrics.performance.tickP99Ms = percentile(tickDurationSamples, 99);

  const now = Date.now();
  if (metrics.world.lastTickAt) {
    const interval = now - metrics.world.lastTickAt;
    appendSample(tickIntervalSamples, interval, JITTER_WINDOW);
    const mean = average(tickIntervalSamples);
    const jitter = mean === 0 ? 0 : (stdDev(tickIntervalSamples) / mean) * 100;
    metrics.performance.tickJitterPct = Number(jitter.toFixed(3));
  }
  metrics.world.lastTickAt = now;

  if (durationMs > metrics.performance.latencyBudgetMs) {
    metrics.performance.tickBudgetExceeded += 1;
  }
};

export const recordTickEventCount = (eventCount) => {
  if (!Number.isFinite(eventCount)) return;
  metrics.world.eventsPerTickLast = eventCount;
  appendSample(eventsPerTickSamples, eventCount);
  metrics.world.eventsPerTickAvg = Number(average(eventsPerTickSamples).toFixed(3));
};

export const getKpiSnapshot = () => {
  updateReconnectionsPerMinute();
  return {
    generatedAt: Date.now(),
    kpis: {
      tickP95Ms: {
        value: Number((metrics.performance.tickP95Ms || 0).toFixed(3)),
        status: classifyKpi(metrics.performance.tickP95Ms, { green: 200, yellow: 500 }),
        unit: 'ms'
      },
      tickP99Ms: {
        value: Number((metrics.performance.tickP99Ms || 0).toFixed(3)),
        status: classifyKpi(metrics.performance.tickP99Ms, { green: 500, yellow: 2000 }),
        unit: 'ms'
      },
      wsLatencyP95Ms: {
        value: Number((metrics.performance.wsLatencyP95Ms || 0).toFixed(3)),
        status: classifyKpi(metrics.performance.wsLatencyP95Ms, { green: 300, yellow: 1000 }),
        unit: 'ms'
      },
      reconnectionsPerMin: {
        value: metrics.socket.reconnectionsPerMin || 0,
        status: classifyKpi(metrics.socket.reconnectionsPerMin, { green: 3, yellow: 10 }),
        unit: 'count/min'
      },
      eventsPerTick: {
        value: Number((metrics.world.eventsPerTickLast || 0).toFixed(3)),
        status: classifyKpi(metrics.world.eventsPerTickLast, { green: 50, yellow: 10 }, true),
        unit: 'count'
      },
      tickJitterPct: {
        value: Number((metrics.performance.tickJitterPct || 0).toFixed(3)),
        status: classifyKpi(metrics.performance.tickJitterPct, { green: 10, yellow: 20 }),
        unit: '%'
      }
    }
  };
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

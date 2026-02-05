const buildCounter = () => Object.create(null);

export const metrics = {
  startTime: Date.now(),
  http: {
    total: 0,
    byMethod: buildCounter(),
    byStatus: buildCounter(),
    byRoute: buildCounter()
  },
  socket: {
    connections: 0,
    disconnections: 0,
    events: buildCounter(),
    rateLimited: buildCounter()
  },
  world: {
    ticks: 0,
    lastTickMs: 0,
    avgTickMs: 0
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
  });
  next();
};

export const trackSocketEvent = (eventName) => {
  metrics.socket.events[eventName] = (metrics.socket.events[eventName] || 0) + 1;
};

export const trackSocketRateLimit = (eventName) => {
  metrics.socket.rateLimited[eventName] = (metrics.socket.rateLimited[eventName] || 0) + 1;
};

export const recordTickDuration = (durationMs) => {
  metrics.world.ticks += 1;
  metrics.world.lastTickMs = durationMs;
  metrics.world.avgTickMs =
    metrics.world.avgTickMs === 0
      ? durationMs
      : (metrics.world.avgTickMs * (metrics.world.ticks - 1) + durationMs) / metrics.world.ticks;
};

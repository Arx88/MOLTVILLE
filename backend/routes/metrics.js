import express from 'express';

import { metrics } from '../utils/metrics.js';

const formatPrometheusMetric = (name, value, labels = null) => {
  const hasLabels = labels && Object.keys(labels).length > 0;
  const labelString = hasLabels
    ? `{${Object.entries(labels)
      .map(([key, labelValue]) => `${key}="${String(labelValue).replace(/"/g, '\\"')}"`)
      .join(',')}}`
    : '';
  return `${name}${labelString} ${value}`;
};

export const createMetricsRouter = ({
  io,
  eventManager,
  economyManager,
  worldState,
  moltbotRegistry
}) => {
  const router = express.Router();

  router.get('/', (req, res) => {
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
      errors: metrics.errors,
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
      world: metrics.world,
      health: {
        agents: moltbotRegistry.getAgentCount(),
        worldTick: worldState.getCurrentTick()
      }
    });
  });

  router.get('/prometheus', (req, res) => {
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

    const lines = [
      '# HELP moltville_uptime_seconds Server uptime in seconds.',
      '# TYPE moltville_uptime_seconds gauge',
      formatPrometheusMetric('moltville_uptime_seconds', Math.floor((Date.now() - metrics.startTime) / 1000)),
      '# HELP moltville_http_requests_total Total HTTP requests handled.',
      '# TYPE moltville_http_requests_total counter',
      formatPrometheusMetric('moltville_http_requests_total', metrics.http.total),
      ...Object.entries(metrics.http.byMethod).map(([method, value]) =>
        formatPrometheusMetric('moltville_http_requests_by_method_total', value, { method })
      ),
      ...Object.entries(metrics.http.byStatus).map(([status, value]) =>
        formatPrometheusMetric('moltville_http_requests_by_status_total', value, { status })
      ),
      ...Object.entries(metrics.http.byRoute).map(([route, value]) =>
        formatPrometheusMetric('moltville_http_requests_by_route_total', value, { route })
      ),
      '# HELP moltville_http_last_duration_ms Duration of the most recent HTTP request.',
      '# TYPE moltville_http_last_duration_ms gauge',
      formatPrometheusMetric('moltville_http_last_duration_ms', metrics.http.lastDurationMs || 0),
      '# HELP moltville_http_errors_total Total HTTP error responses (status >= 400).',
      '# TYPE moltville_http_errors_total counter',
      formatPrometheusMetric('moltville_http_errors_total', metrics.errors.http.total),
      ...Object.entries(metrics.errors.http.byStatus).map(([status, value]) =>
        formatPrometheusMetric('moltville_http_errors_by_status_total', value, { status })
      ),
      ...Object.entries(metrics.errors.http.byRoute).map(([route, value]) =>
        formatPrometheusMetric('moltville_http_errors_by_route_total', value, { route })
      ),
      '# HELP moltville_socket_connections_total Total socket connections.',
      '# TYPE moltville_socket_connections_total counter',
      formatPrometheusMetric('moltville_socket_connections_total', metrics.socket.connections),
      '# HELP moltville_socket_disconnections_total Total socket disconnections.',
      '# TYPE moltville_socket_disconnections_total counter',
      formatPrometheusMetric('moltville_socket_disconnections_total', metrics.socket.disconnections),
      '# HELP moltville_socket_events_total Total socket events by name.',
      '# TYPE moltville_socket_events_total counter',
      ...Object.entries(metrics.socket.events).map(([eventName, value]) =>
        formatPrometheusMetric('moltville_socket_events_total', value, { event: eventName })
      ),
      '# HELP moltville_socket_rate_limited_total Total socket rate limited events.',
      '# TYPE moltville_socket_rate_limited_total counter',
      ...Object.entries(metrics.socket.rateLimited).map(([eventName, value]) =>
        formatPrometheusMetric('moltville_socket_rate_limited_total', value, { event: eventName })
      ),
      '# HELP moltville_socket_event_latency_ms Socket event latency stats in milliseconds.',
      '# TYPE moltville_socket_event_latency_ms gauge',
      ...Object.entries(metrics.socket.latency.byEvent).flatMap(([eventName, stats]) => ([
        formatPrometheusMetric('moltville_socket_event_latency_ms', stats.avgMs, { event: eventName, stat: 'avg' }),
        formatPrometheusMetric('moltville_socket_event_latency_ms', stats.lastMs, { event: eventName, stat: 'last' }),
        formatPrometheusMetric('moltville_socket_event_latency_ms', stats.maxMs, { event: eventName, stat: 'max' }),
        formatPrometheusMetric('moltville_socket_event_latency_ms', stats.count, { event: eventName, stat: 'count' })
      ])),
      '# HELP moltville_socket_errors_total Total socket errors.',
      '# TYPE moltville_socket_errors_total counter',
      formatPrometheusMetric('moltville_socket_errors_total', metrics.errors.socket.total),
      ...Object.entries(metrics.errors.socket.byEvent).map(([eventName, value]) =>
        formatPrometheusMetric('moltville_socket_errors_by_event_total', value, { event: eventName })
      ),
      '# HELP moltville_socket_connected_clients Current connected socket clients.',
      '# TYPE moltville_socket_connected_clients gauge',
      formatPrometheusMetric('moltville_socket_connected_clients', io.sockets.sockets.size),
      '# HELP moltville_socket_connected_agents Current connected agents.',
      '# TYPE moltville_socket_connected_agents gauge',
      formatPrometheusMetric('moltville_socket_connected_agents', moltbotRegistry.getAgentCount()),
      '# HELP moltville_socket_connected_viewers Current connected viewers.',
      '# TYPE moltville_socket_connected_viewers gauge',
      formatPrometheusMetric('moltville_socket_connected_viewers', viewersRoom ? viewersRoom.size : 0),
      '# HELP moltville_world_ticks_total Total world ticks.',
      '# TYPE moltville_world_ticks_total counter',
      formatPrometheusMetric('moltville_world_ticks_total', metrics.world.ticks),
      '# HELP moltville_world_tick_last_ms Duration of the most recent world tick in ms.',
      '# TYPE moltville_world_tick_last_ms gauge',
      formatPrometheusMetric('moltville_world_tick_last_ms', metrics.world.lastTickMs),
      '# HELP moltville_world_tick_avg_ms Average world tick duration in ms.',
      '# TYPE moltville_world_tick_avg_ms gauge',
      formatPrometheusMetric('moltville_world_tick_avg_ms', metrics.world.avgTickMs),
      '# HELP moltville_economy_agents_with_balance Agents with balance entries.',
      '# TYPE moltville_economy_agents_with_balance gauge',
      formatPrometheusMetric('moltville_economy_agents_with_balance', economyManager.balances.size),
      '# HELP moltville_economy_average_balance Average agent balance.',
      '# TYPE moltville_economy_average_balance gauge',
      formatPrometheusMetric('moltville_economy_average_balance', economyManager.getAverageBalance()),
      '# HELP moltville_economy_item_transactions Total item transactions cached.',
      '# TYPE moltville_economy_item_transactions gauge',
      formatPrometheusMetric('moltville_economy_item_transactions', economyManager.getItemTransactions(500).length),
      '# HELP moltville_events_total Total events by status.',
      '# TYPE moltville_events_total gauge',
      formatPrometheusMetric('moltville_events_total', eventCounts.total, { status: 'all' }),
      formatPrometheusMetric('moltville_events_total', eventCounts.scheduled, { status: 'scheduled' }),
      formatPrometheusMetric('moltville_events_total', eventCounts.active, { status: 'active' }),
      formatPrometheusMetric('moltville_events_total', eventCounts.ended, { status: 'ended' })
    ];

    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(lines.join('\n'));
  });

  return router;
};

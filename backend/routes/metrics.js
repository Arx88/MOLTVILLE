import express from 'express';

import { metrics } from '../utils/metrics.js';
import { buildDramaScore } from '../utils/analyticsStore.js';

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
  moltbotRegistry,
  cityMoodManager,
  actionQueue,
  commitmentManager,
  reputationManager,
  featureFlags
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
    const activeEvents = eventCounts.active;
    const econMetrics = typeof economyManager?.getMetrics === 'function' ? economyManager.getMetrics() : {};
    const dramaScore = buildDramaScore({
      mood: cityMoodManager?.getSummary(),
      activeEvents,
      npcDramaPoints: metrics.npc.dramaPoints
    });

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
        itemTransactions: economyManager.getItemTransactions(500).length,
        treasury: economyManager.getTreasurySummary(),
        ...econMetrics,
        treasuryNet: economyManager.getTreasurySummary().balance
      },
      events: eventCounts,
      world: metrics.world,
      population: metrics.population,
      npc: metrics.npc,
      performance: metrics.performance,
      health: {
        ...metrics.health,
        agents: moltbotRegistry.getAgentCount(),
        worldTick: worldState.getCurrentTick()
      },
      drama: {
        score: dramaScore
      }
    });
  });

  router.get('/intents', (req, res) => {
    const intentRoutes = Object.entries(metrics.http.byRoute || {})
      .filter(([route]) => route.includes('/api/moltbot/') || route.includes('/api/telemetry/') || route.includes('/api/metrics/intents'))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .reduce((acc, [route, count]) => ({ ...acc, [route]: count }), {});

    const topActionTypes = Object.entries(metrics.intent?.actionTypes || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((acc, [actionType, count]) => ({ ...acc, [actionType]: count }), {});

    const topAgents = Object.entries(metrics.intent?.byAgent || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((acc, [agentId, count]) => ({ ...acc, [agentId]: count }), {});

    const uptimeMinutes = Math.max(1, Math.floor((Date.now() - metrics.startTime) / 60000));
    const econMetrics = typeof economyManager?.getMetrics === 'function' ? economyManager.getMetrics() : {};
    const commitmentStats = commitmentManager?.stats ? commitmentManager.stats() : { created: 0, completed: 0, expired: 0 };
    const intentPayload = metrics.intent || {};
    const actionsExecuted = Object.values(intentPayload.actionTypes || {}).reduce((sum, n) => sum + Number(n || 0), 0);

    res.json({
      success: true,
      generatedAt: Date.now(),
      health: metrics.health,
      httpErrors: metrics.errors?.http || {},
      connectedAgents: moltbotRegistry.getAgentCount(),
      queueDepth: actionQueue.getQueueLength ? actionQueue.getQueueLength() : null,
      intents: intentPayload,
      topActionTypes,
      topAgents,
      intentRoutes,
      featureFlags: featureFlags || {},
      commitments: commitmentStats,
      rates: {
        conversationMessagesPerMin: Number(((intentPayload.conversationMessages || 0) / uptimeMinutes).toFixed(3)),
        actionsExecutedPerMin: Number((actionsExecuted / uptimeMinutes).toFixed(3)),
        jobApplyRatePerMin: Number(((econMetrics?.jobsApplied || 0) / uptimeMinutes).toFixed(3)),
        jobCompletionRatePerMin: Number(((econMetrics?.jobsCompleted || 0) / uptimeMinutes).toFixed(3))
      },
      loopScore: Number((Math.max(0, (intentPayload.conversationMessages || 0) - actionsExecuted) / uptimeMinutes).toFixed(3)),
      reputationDeltaTop: reputationManager?.leaderboard ? reputationManager.leaderboard(5) : []
    });
  });

  router.get('/conversations', (req, res) => {
    const conversations = Array.from((req.app.locals?.interactionEngine?.conversations || new Map()).values());
    const active = conversations.filter(c => c?.active !== false);
    const totalMessages = active.reduce((sum, c) => sum + ((c?.messages || []).length), 0);
    res.json({
      success: true,
      active: active.length,
      totalMessages,
      avgMessagesPerConv: active.length ? Number((totalMessages / active.length).toFixed(2)) : 0,
      conversations: active.map(c => ({
        id: c.id,
        participants: c.participants,
        messageCount: (c.messages || []).length,
        lastActivity: c.lastActivity,
        ageSeconds: Math.max(0, Math.floor((Date.now() - (c.startedAt || Date.now())) / 1000))
      }))
    });
  });

  router.get('/summary', (req, res) => {
    const uptimeMinutes = Math.max(1, Math.floor((Date.now() - metrics.startTime) / 60000));
    const econMetrics = typeof economyManager?.getMetrics === 'function' ? economyManager.getMetrics() : {};
    const intent = metrics.intent || {};
    const actionsExecuted = Object.values(intent.actionTypes || {}).reduce((sum, n) => sum + Number(n || 0), 0);
    const commitments = commitmentManager?.stats ? commitmentManager.stats() : { created: 0, completed: 0, expired: 0 };
    res.json({
      success: true,
      generatedAt: Date.now(),
      connectedAgents: moltbotRegistry.getAgentCount(),
      conversationMessagesPerMin: Number(((intent.conversationMessages || 0) / uptimeMinutes).toFixed(3)),
      actionsExecutedPerMin: Number((actionsExecuted / uptimeMinutes).toFixed(3)),
      jobsApplied: econMetrics?.jobsApplied || 0,
      jobsCompleted: econMetrics?.jobsCompleted || 0,
      paymentsCount: econMetrics?.paymentsCount || 0,
      treasuryNet: economyManager.getTreasurySummary().balance,
      commitments,
      loopScore: Number((Math.max(0, (intent.conversationMessages || 0) - actionsExecuted) / uptimeMinutes).toFixed(3))
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
    const dramaScore = buildDramaScore({
      mood: cityMoodManager?.getSummary(),
      activeEvents: eventCounts.active,
      npcDramaPoints: metrics.npc.dramaPoints
    });

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
      '# HELP moltville_agents_total Total agents in the city.',
      '# TYPE moltville_agents_total gauge',
      formatPrometheusMetric('moltville_agents_total', metrics.population.total),
      '# HELP moltville_agents_real Total real agents in the city.',
      '# TYPE moltville_agents_real gauge',
      formatPrometheusMetric('moltville_agents_real', metrics.population.real),
      '# HELP moltville_agents_npc Total NPC agents in the city.',
      '# TYPE moltville_agents_npc gauge',
      formatPrometheusMetric('moltville_agents_npc', metrics.population.npc),
      '# HELP moltville_npc_drama_total Total drama points generated by NPCs.',
      '# TYPE moltville_npc_drama_total counter',
      formatPrometheusMetric('moltville_npc_drama_total', metrics.npc.dramaPoints),
      '# HELP moltville_current_scene_score Current drama score.',
      '# TYPE moltville_current_scene_score gauge',
      formatPrometheusMetric('moltville_current_scene_score', dramaScore),
      '# HELP moltville_health_low_population_total Low population events detected.',
      '# TYPE moltville_health_low_population_total counter',
      formatPrometheusMetric('moltville_health_low_population_total', metrics.health.lowPopulationEvents),
      '# HELP moltville_health_high_tick_latency_total High tick latency events detected.',
      '# TYPE moltville_health_high_tick_latency_total counter',
      formatPrometheusMetric('moltville_health_high_tick_latency_total', metrics.health.highTickLatencyEvents),
      '# HELP moltville_performance_latency_budget_ms Performance budget for world ticks.',
      '# TYPE moltville_performance_latency_budget_ms gauge',
      formatPrometheusMetric('moltville_performance_latency_budget_ms', metrics.performance.latencyBudgetMs),
      '# HELP moltville_performance_tick_budget_exceeded_total Number of ticks above latency budget.',
      '# TYPE moltville_performance_tick_budget_exceeded_total counter',
      formatPrometheusMetric('moltville_performance_tick_budget_exceeded_total', metrics.performance.tickBudgetExceeded),
      '# HELP moltville_economy_agents_with_balance Agents with balance entries.',
      '# TYPE moltville_economy_agents_with_balance gauge',
      formatPrometheusMetric('moltville_economy_agents_with_balance', economyManager.balances.size),
      '# HELP moltville_economy_average_balance Average agent balance.',
      '# TYPE moltville_economy_average_balance gauge',
      formatPrometheusMetric('moltville_economy_average_balance', economyManager.getAverageBalance()),
      '# HELP moltville_economy_item_transactions Total item transactions cached.',
      '# TYPE moltville_economy_item_transactions gauge',
      formatPrometheusMetric('moltville_economy_item_transactions', economyManager.getItemTransactions(500).length),
      '# HELP moltville_economy_treasury_balance Treasury balance (income - expense).',
      '# TYPE moltville_economy_treasury_balance gauge',
      formatPrometheusMetric('moltville_economy_treasury_balance', economyManager.getTreasurySummary().balance),
      '# HELP moltville_economy_treasury_income_total Treasury income total.',
      '# TYPE moltville_economy_treasury_income_total counter',
      formatPrometheusMetric('moltville_economy_treasury_income_total', economyManager.getTreasurySummary().income),
      '# HELP moltville_economy_treasury_expense_total Treasury expense total.',
      '# TYPE moltville_economy_treasury_expense_total counter',
      formatPrometheusMetric('moltville_economy_treasury_expense_total', economyManager.getTreasurySummary().expense),
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

import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';

import { createMetricsRouter } from '../routes/metrics.js';

const createServer = () => {
  const app = express();
  const io = {
    sockets: {
      adapter: { rooms: new Map() },
      sockets: { size: 0 }
    }
  };
  const eventManager = { getSummary: () => [] };
  const economyManager = {
    balances: new Map(),
    getAverageBalance: () => 0,
    getInventoryStats: () => ({ totalItems: 0, totalAgents: 0 }),
    getItemTransactions: () => [],
    getTreasurySummary: () => ({ balance: 0, income: 0, expense: 0 })
  };
  const worldState = { getCurrentTick: () => 0 };
  const moltbotRegistry = { getAgentCount: () => 0 };

  app.use('/api/metrics', createMetricsRouter({
    io,
    eventManager,
    economyManager,
    worldState,
    moltbotRegistry
  }));

  const server = app.listen(0);
  const port = server.address().port;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
};

test('GET /api/metrics returns core metrics payload', async () => {
  const { server, baseUrl } = createServer();
  try {
    const response = await fetch(`${baseUrl}/api/metrics`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok('uptimeSec' in payload);
    assert.ok('http' in payload);
    assert.ok('socket' in payload);
    assert.ok('economy' in payload);
    assert.ok('treasury' in payload.economy);
    assert.ok('events' in payload);
    assert.ok('world' in payload);
    assert.ok('performance' in payload);
    assert.equal(payload.health.agents, 0);
    assert.equal(payload.health.worldTick, 0);
  } finally {
    server.close();
  }
});

test('GET /api/metrics/prometheus returns Prometheus text format', async () => {
  const { server, baseUrl } = createServer();
  try {
    const response = await fetch(`${baseUrl}/api/metrics/prometheus`);
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get('content-type') || '',
      /text\/plain;\s*charset=utf-8;\s*version=0\.0\.4/
    );
    const body = await response.text();
    assert.ok(body.includes('moltville_uptime_seconds'));
    assert.ok(body.includes('moltville_http_requests_total'));
    assert.ok(body.includes('moltville_socket_connections_total'));
  } finally {
    server.close();
  }
});

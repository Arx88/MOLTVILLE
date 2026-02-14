import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getKpiSnapshot,
  metrics,
  recordHttpError,
  recordSocketConnection,
  recordSocketDisconnection,
  recordSocketDuration,
  recordSocketError,
  recordSocketReconnection,
  recordTickDuration,
  recordTickEventCount,
  trackHttpRequest,
  trackSocketEvent,
  trackSocketRateLimit
} from '../utils/metrics.js';

const createResponse = () => {
  const handlers = {};
  return {
    statusCode: 200,
    on: (event, handler) => {
      handlers[event] = handler;
    },
    finish: () => {
      handlers.finish?.();
    }
  };
};

test('metrics helpers track http requests and errors', () => {
  const req = { method: 'GET', baseUrl: '/api', route: { path: '/health' }, path: '/health' };
  const res = createResponse();
  trackHttpRequest(req, res, () => {});
  res.finish();
  assert.ok(metrics.http.total >= 1);
  recordHttpError(req, res, new Error('boom'));
  assert.ok(metrics.errors.http.byMessage.boom >= 1);

  const errRes = createResponse();
  errRes.statusCode = 500;
  trackHttpRequest(req, errRes, () => {});
  errRes.finish();
  assert.ok(metrics.errors.http.total >= 1);
});

test('metrics helpers track socket events and durations', () => {
  const beforeConnections = metrics.socket.connections;
  const beforeDisconnections = metrics.socket.disconnections;
  const beforeReconnections = metrics.socket.reconnections;
  recordSocketConnection();
  recordSocketReconnection();
  recordSocketDisconnection();
  trackSocketEvent('agent:move');
  trackSocketRateLimit('agent:move');
  recordSocketDuration('agent:move', 12);
  recordSocketError('agent:move', new Error('bad'));
  assert.equal(metrics.socket.connections, beforeConnections + 1);
  assert.equal(metrics.socket.reconnections, beforeReconnections + 1);
  assert.equal(metrics.socket.disconnections, beforeDisconnections + 1);
  assert.ok(metrics.socket.events['agent:move'] >= 1);
  assert.ok(metrics.socket.rateLimited['agent:move'] >= 1);
  assert.ok(metrics.socket.latency.byEvent['agent:move'].count >= 1);
  assert.ok(metrics.errors.socket.byEvent['agent:move'] >= 1);
});

test('metrics helpers track tick performance budgets', () => {
  const before = metrics.performance.tickBudgetExceeded;
  recordTickEventCount(77);
  recordTickDuration(metrics.performance.latencyBudgetMs + 5);
  assert.equal(metrics.performance.tickBudgetExceeded, before + 1);
  assert.ok(metrics.performance.tickP95Ms >= 0);
  assert.ok(metrics.performance.tickP99Ms >= 0);
  assert.ok(metrics.world.eventsPerTickLast >= 77);
});

test('metrics helpers build KPI snapshot with statuses', () => {
  const snapshot = getKpiSnapshot();
  assert.ok(snapshot.generatedAt > 0);
  assert.ok(snapshot.kpis.tickP95Ms);
  assert.ok(snapshot.kpis.tickP99Ms);
  assert.ok(snapshot.kpis.wsLatencyP95Ms);
  assert.ok(snapshot.kpis.reconnectionsPerMin);
  assert.ok(snapshot.kpis.eventsPerTick);
});

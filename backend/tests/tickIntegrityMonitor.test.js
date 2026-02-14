import test from 'node:test';
import assert from 'node:assert/strict';

import { TickIntegrityMonitor } from '../core/TickIntegrityMonitor.js';

test('computeHash changes when nested state changes', () => {
  const monitor = new TickIntegrityMonitor();

  const before = {
    tick: 1,
    agents: {
      bot1: { x: 10, y: 5 }
    },
    events: [
      { id: 'evt-1', status: 'active' }
    ]
  };

  const after = {
    tick: 1,
    agents: {
      bot1: { x: 11, y: 5 }
    },
    events: [
      { id: 'evt-1', status: 'active' }
    ]
  };

  assert.notEqual(monitor.computeHash(before), monitor.computeHash(after));
});

test('computeHash is stable across key ordering differences', () => {
  const monitor = new TickIntegrityMonitor();

  const stateA = {
    tick: 2,
    agents: {
      bot2: { y: 9, x: 4 }
    },
    events: [
      { type: 'market', id: 'evt-2' }
    ]
  };

  const stateB = {
    events: [
      { id: 'evt-2', type: 'market' }
    ],
    agents: {
      bot2: { x: 4, y: 9 }
    },
    tick: 2
  };

  assert.equal(monitor.computeHash(stateA), monitor.computeHash(stateB));
});

test('finishTick marks state changes correctly', () => {
  const monitor = new TickIntegrityMonitor();

  monitor.startTick(10, { tick: 10, agents: { bot: { x: 1, y: 1 } } }, 'corr-1');
  const unchanged = monitor.finishTick(10, { tick: 10, agents: { bot: { x: 1, y: 1 } } }, 'corr-1');
  assert.equal(unchanged.changed, false);

  monitor.startTick(11, { tick: 11, agents: { bot: { x: 1, y: 1 } } }, 'corr-2');
  const changed = monitor.finishTick(11, { tick: 11, agents: { bot: { x: 2, y: 1 } } }, 'corr-2');
  assert.equal(changed.changed, true);
});
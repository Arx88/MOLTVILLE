import assert from 'node:assert/strict';
import test from 'node:test';

import { ActionQueue } from '../core/ActionQueue.js';

const createQueue = () => {
  const worldState = {};
  const registry = {};
  return new ActionQueue(worldState, registry);
};

test('ActionQueue orders actions by priority, timestamp, and id', async () => {
  const queue = createQueue();

  await queue.enqueue({ id: 'c', type: 'ACTION', agentId: 'a1', priority: 2, timestamp: 200 });
  await queue.enqueue({ id: 'b', type: 'MOVE', agentId: 'a2', priority: 1, timestamp: 300 });
  await queue.enqueue({ id: 'a', type: 'MOVE_TO', agentId: 'a3', priority: 1, timestamp: 300 });
  await queue.enqueue({ id: 'd', type: 'ACTION', agentId: 'a4', priority: 1, timestamp: 100 });

  assert.deepEqual(
    queue.queue.map(action => action.id),
    ['d', 'a', 'b', 'c']
  );
});

test('ActionQueue keeps deterministic order after snapshot restore', async () => {
  const queue = createQueue();
  await queue.enqueue({ id: 'evt-2', type: 'MOVE', agentId: 'a1', priority: 2, timestamp: 20 });
  await queue.enqueue({ id: 'evt-1', type: 'MOVE', agentId: 'a2', priority: 2, timestamp: 20 });
  const snapshot = queue.createSnapshot();

  const restored = createQueue();
  restored.loadSnapshot(snapshot);

  assert.deepEqual(
    restored.queue.map(action => action.id),
    ['evt-1', 'evt-2']
  );
});


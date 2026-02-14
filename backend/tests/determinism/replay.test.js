import test from 'node:test';
import assert from 'node:assert/strict';

import { WorldStateManager } from '../../core/WorldStateManager.js';

test('Replay determinism: same snapshot and actions produce same positions', () => {
  const seed = new WorldStateManager();
  seed.addAgent('agent-1', { x: 12, y: 12 });
  const snapshot = seed.createSnapshot();

  const worldA = new WorldStateManager();
  const worldB = new WorldStateManager();
  worldA.loadSnapshot(snapshot);
  worldB.loadSnapshot(snapshot);

  worldA.moveAgentTo('agent-1', 16, 16);
  worldB.moveAgentTo('agent-1', 16, 16);

  for (let index = 0; index < 15; index += 1) {
    worldA.tick();
    worldB.tick();
  }

  assert.deepEqual(worldA.getAgentPosition('agent-1'), worldB.getAgentPosition('agent-1'));
  assert.equal(worldA.getCurrentTick(), worldB.getCurrentTick());
  assert.deepEqual(worldA.getAllAgentPositions(), worldB.getAllAgentPositions());
});

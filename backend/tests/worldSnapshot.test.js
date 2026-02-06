import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WorldStateManager } from '../core/WorldStateManager.js';

test('loadSnapshot rejects unsupported versions', () => {
  const worldState = new WorldStateManager();
  assert.throws(() => {
    worldState.loadSnapshot({ version: 2 });
  }, /Snapshot versión no soportada/);
});

test('loadSnapshot restores world timing and need configuration', () => {
  const worldState = new WorldStateManager();
  const snapshot = worldState.createSnapshot();
  snapshot.world.lastNeedUpdate = 12345;
  snapshot.world.lastExpansionCheck = 67890;
  snapshot.world.needRates = { hungerPerMinute: 2.5 };
  snapshot.world.needThresholds = { energy: 15 };

  const restored = new WorldStateManager();
  restored.loadSnapshot(snapshot);

  assert.equal(restored.lastNeedUpdate, 12345);
  assert.equal(restored.lastExpansionCheck, 67890);
  assert.equal(restored.needRates.hungerPerMinute, 2.5);
  assert.equal(restored.needThresholds.energy, 15);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WorldStateManager } from '../core/WorldStateManager.js';

test('loadSnapshot rejects unsupported versions', () => {
  const worldState = new WorldStateManager();
  assert.throws(() => {
    worldState.loadSnapshot({ version: 2 });
  }, /Snapshot versión no soportada/);
});

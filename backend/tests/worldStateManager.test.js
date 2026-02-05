import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldStateManager } from '../core/WorldStateManager.js';

test('WorldStateManager.findPath returns a path when route is walkable', () => {
  const world = new WorldStateManager();
  const start = { x: 12, y: 12 };
  const end = { x: 14, y: 14 };
  const path = world.findPath(start.x, start.y, end.x, end.y);

  assert.ok(Array.isArray(path), 'expected array path');
  assert.ok(path.length > 1, 'expected path length greater than 1');
  assert.deepEqual(path[0], start);
  assert.deepEqual(path[path.length - 1], end);
});

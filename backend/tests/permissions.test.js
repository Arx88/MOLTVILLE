import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AGENT_PERMISSIONS, hasPermission, listPermissions, normalizePermissions } from '../utils/permissions.js';

test('permissions helpers normalize and filter inputs', () => {
  const result = normalizePermissions(['move', 'speak', 'bad', '']);
  assert.deepEqual(result, ['move', 'speak']);
});

test('permissions helpers fall back to defaults', () => {
  const result = normalizePermissions(null);
  assert.deepEqual(result, DEFAULT_AGENT_PERMISSIONS);
});

test('permissions helper checks inclusion', () => {
  assert.equal(hasPermission(['move', 'speak'], 'move'), true);
  assert.equal(hasPermission(['move', 'speak'], 'action'), false);
});

test('permissions list exposes supported permissions', () => {
  const permissions = listPermissions();
  assert.ok(permissions.includes('move'));
  assert.ok(permissions.includes('perceive'));
});

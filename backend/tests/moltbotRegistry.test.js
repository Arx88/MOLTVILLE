import test from 'node:test';
import assert from 'node:assert/strict';
import { MoltbotRegistry } from '../core/MoltbotRegistry.js';

test('MoltbotRegistry records API key events without a database', async () => {
  const registry = new MoltbotRegistry();

  await registry.issueApiKey('key-1', {
    actorId: 'admin-1',
    actorType: 'operator',
    metadata: { reason: 'seed' }
  });
  registry.revokeApiKey('key-1', { actorId: 'admin-1' });

  const events = await registry.listApiKeyEvents(10);
  const actions = events.map(event => event.action);

  assert.ok(actions.includes('issued'));
  assert.ok(actions.includes('revoked'));
});

test('MoltbotRegistry rotation emits issued, revoked, and rotated events', async () => {
  const registry = new MoltbotRegistry();

  await registry.issueApiKey('old-key');
  await registry.rotateApiKey('old-key', 'new-key', {
    metadata: { reason: 'manual' }
  });

  const events = await registry.listApiKeyEvents(10);
  const actions = events.map(event => event.action);

  assert.ok(actions.includes('issued'));
  assert.ok(actions.includes('revoked'));
  assert.ok(actions.includes('rotated'));
});

test('MoltbotRegistry lists issued keys in memory mode', async () => {
  const registry = new MoltbotRegistry();

  await registry.issueApiKey('key-1');

  const keys = await registry.listApiKeys();
  assert.equal(keys.length, 1);
  assert.equal(keys[0].apiKey, 'key-1');
  assert.equal(keys[0].status, 'active');
});

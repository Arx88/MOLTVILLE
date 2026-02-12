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
  const key = keys.find(item => item.apiKey === 'key-1');
  assert.ok(key);
  assert.equal(key.status, 'active');
});

test('MoltbotRegistry stores permissions for agents', async () => {
  const registry = new MoltbotRegistry();

  const agent = await registry.registerAgent({
    id: 'agent-1',
    name: 'Molt',
    avatar: 'char1',
    socketId: 'socket-1',
    apiKey: 'key-1',
    permissions: ['move', 'perceive']
  });

  assert.deepEqual(agent.permissions, ['move', 'perceive']);

  const updated = registry.setAgentPermissions('agent-1', ['speak', 'action']);
  assert.deepEqual(updated, ['speak', 'action']);
  assert.deepEqual(registry.getAgent('agent-1').permissions, ['speak', 'action']);
});

test('MoltbotRegistry stores memories and relationships', async () => {
  const registry = new MoltbotRegistry();
  await registry.registerAgent({
    id: 'agent-1',
    name: 'MemoryBot',
    avatar: 'char1',
    socketId: 'socket-1',
    apiKey: 'key-1'
  });

  registry.addMemory('agent-1', 'interaction', { note: 'hello' });
  registry.updateRelationship('agent-1', 'agent-2', 10, { trust: 5, respect: 2 });

  const memory = registry.getAgentMemory('agent-1');
  assert.equal(memory.interactions.length, 1);
  assert.ok(memory.relationships['agent-2']);
});

test('MoltbotRegistry prunes and summarizes memories', async () => {
  const registry = new MoltbotRegistry();
  registry.memoryLimits = {
    interactionsMax: 1,
    locationsMax: 1,
    maxAgeMs: 1000,
    pruneIntervalMs: 0
  };
  await registry.registerAgent({
    id: 'agent-1',
    name: 'PruneBot',
    avatar: 'char1',
    socketId: 'socket-1',
    apiKey: 'key-1'
  });

  registry.addMemory('agent-1', 'interaction', { note: 'first' });
  registry.addMemory('agent-1', 'interaction', { note: 'second' });
  registry.addMemory('agent-1', 'location', { buildingId: 'cafe-1' });
  registry.addMemory('agent-1', 'location', { buildingId: 'park-1' });
  registry.pruneMemories();

  const interactions = registry.getAgentMemory('agent-1', 'interactions', 5);
  const locations = registry.getAgentMemory('agent-1', 'locations', 5);
  assert.equal(interactions.length, 1);
  assert.equal(locations.length, 1);
});

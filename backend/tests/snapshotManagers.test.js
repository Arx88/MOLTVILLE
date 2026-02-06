import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ActionQueue } from '../core/ActionQueue.js';
import { EconomyManager } from '../core/EconomyManager.js';
import { EventManager } from '../core/EventManager.js';
import { AestheticsManager } from '../core/AestheticsManager.js';
import { CityMoodManager } from '../core/CityMoodManager.js';
import { GovernanceManager } from '../core/GovernanceManager.js';
import { InteractionEngine } from '../core/InteractionEngine.js';
import { MoltbotRegistry } from '../core/MoltbotRegistry.js';
import { VotingManager } from '../core/VotingManager.js';
import { WorldStateManager } from '../core/WorldStateManager.js';

test('EconomyManager snapshot restores balances and inventories', () => {
  const worldState = new WorldStateManager();
  const economy = new EconomyManager(worldState);
  economy.registerAgent('agent-1');
  economy.incrementBalance('agent-1', 5, 'bonus');
  economy.addItem('agent-1', { itemId: 'apple', name: 'Apple', quantity: 2 });

  const snapshot = economy.createSnapshot();
  const restored = new EconomyManager(worldState);
  restored.loadSnapshot(snapshot);

  assert.equal(restored.getBalance('agent-1'), economy.getBalance('agent-1'));
  assert.deepEqual(restored.getInventory('agent-1'), economy.getInventory('agent-1'));
});

test('EventManager snapshot restores scheduled events', () => {
  const events = new EventManager();
  const event = events.createEvent({
    name: 'Festival',
    startAt: Date.now() + 60000,
    endAt: Date.now() + 120000
  });

  const snapshot = events.createSnapshot();
  const restored = new EventManager();
  restored.loadSnapshot(snapshot);

  const restoredEvents = restored.listEvents();
  assert.equal(restoredEvents.length, 1);
  assert.equal(restoredEvents[0].id, event.id);
  assert.equal(restoredEvents[0].name, event.name);
});

test('AestheticsManager snapshot restores votes and history', () => {
  const worldState = new WorldStateManager();
  const economy = new EconomyManager(worldState);
  const aesthetics = new AestheticsManager({ worldStateManager: worldState, economyManager: economy });
  const district = worldState.districts[0];
  aesthetics.openVote(district, 5);
  economy.incrementBalance('agent-1', 5, 'seed');
  const optionId = aesthetics.currentVote.options[0].id;
  aesthetics.castVote({ agentId: 'agent-1', optionId });
  aesthetics.recordHistory({
    districtId: district.id,
    districtName: district.name,
    winner: { id: optionId, name: aesthetics.currentVote.options[0].name },
    totalVotes: 1,
    endsAt: Date.now()
  });

  const snapshot = aesthetics.createSnapshot();
  const restored = new AestheticsManager({ worldStateManager: worldState, economyManager: economy });
  restored.loadSnapshot(snapshot);

  assert.ok(restored.currentVote);
  assert.equal(restored.currentVote.options.length, aesthetics.currentVote.options.length);
  assert.equal(restored.currentVote.voters.has('agent-1'), true);
  assert.equal(restored.history.length, 1);
});

test('CityMoodManager snapshot restores cached mood', () => {
  const worldState = new WorldStateManager();
  const economy = new EconomyManager(worldState);
  const registry = new MoltbotRegistry();
  const interactions = new InteractionEngine(worldState, registry);
  const moodManager = new CityMoodManager(economy, interactions);
  const snapshot = moodManager.createSnapshot();

  const restored = new CityMoodManager(economy, interactions);
  restored.loadSnapshot(snapshot);

  assert.deepEqual(restored.getSummary(), snapshot.mood);
});

test('GovernanceManager snapshot restores elections and policies', () => {
  const io = { emit() {} };
  const governance = new GovernanceManager(io);
  governance.startElection();
  governance.registerCandidate('agent-1', 'Candidate One', 'platform');
  governance.castVote('agent-2', 'agent-1');
  governance.setPolicy({ type: 'tax_relief', value: 1, durationMs: 60000, description: 'Test' });

  const snapshot = governance.createSnapshot();
  const restored = new GovernanceManager(io);
  restored.loadSnapshot(snapshot);

  assert.ok(restored.currentElection);
  assert.equal(restored.currentElection.candidates.has('agent-1'), true);
  assert.equal(restored.currentElection.voters.has('agent-2'), true);
  assert.equal(restored.policies.length, 1);
});

test('VotingManager snapshot restores votes and proposals', () => {
  const io = { emit() {} };
  const worldState = new WorldStateManager();
  const voting = new VotingManager(worldState, io);
  voting.proposeBuilding({ agentId: 'agent-1', templateId: 'cafe-roca' });
  voting.startVote();
  const optionId = voting.currentVote.options[0].id;
  voting.castVote('agent-2', optionId);

  const snapshot = voting.createSnapshot();
  const restored = new VotingManager(worldState, io);
  restored.loadSnapshot(snapshot);

  assert.ok(restored.currentVote);
  assert.equal(restored.currentVote.voters.has('agent-2'), true);
  assert.equal(restored.pendingProposals.length, 0);
});

test('MoltbotRegistry snapshot restores agents and API keys', async () => {
  const registry = new MoltbotRegistry();
  await registry.issueApiKey('api-key-123');
  await registry.registerAgent({ id: 'agent-1', name: 'Agent One', avatar: 'char1', socketId: 'sock-1', apiKey: 'api-key-123' });
  registry.addMemory('agent-1', 'interaction', { action: 'hello' });

  const snapshot = registry.createSnapshot();
  const restored = new MoltbotRegistry();
  restored.loadSnapshot(snapshot);

  const restoredAgent = restored.getAgent('agent-1');
  assert.ok(restoredAgent);
  assert.equal(restored.isApiKeyIssued('api-key-123'), true);
  assert.equal(restoredAgent.connected, false);
  assert.equal(restoredAgent.memory.interactions.length, 1);
});

test('ActionQueue snapshot restores queued actions', async () => {
  const worldState = new WorldStateManager();
  const registry = new MoltbotRegistry();
  const queue = new ActionQueue(worldState, registry);
  await queue.enqueue({ type: 'MOVE', agentId: 'agent-1', targetX: 1, targetY: 1, timestamp: Date.now() });
  await queue.enqueue({ type: 'ACTION', agentId: 'agent-2', actionType: 'greet', target: 'agent-1', timestamp: Date.now() });

  const snapshot = queue.createSnapshot();
  const restored = new ActionQueue(worldState, registry);
  restored.loadSnapshot(snapshot);

  assert.equal(restored.getQueueLength(), 2);
  assert.equal(restored.queue[0].type, 'MOVE');
  assert.equal(restored.queue[1].actionType, 'greet');
});

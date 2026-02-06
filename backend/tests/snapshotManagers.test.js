import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EconomyManager } from '../core/EconomyManager.js';
import { EventManager } from '../core/EventManager.js';
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

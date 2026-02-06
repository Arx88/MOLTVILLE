import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ActionQueue } from '../../core/ActionQueue.js';
import { EconomyManager } from '../../core/EconomyManager.js';
import { MoltbotRegistry } from '../../core/MoltbotRegistry.js';
import { VotingManager } from '../../core/VotingManager.js';
import { WorldStateManager } from '../../core/WorldStateManager.js';

const createAgent = async (registry, name, apiKey) => {
  return registry.registerAgent({
    id: `${name.toLowerCase()}-id`,
    name,
    avatar: 'char1',
    socketId: `${name}-socket`,
    apiKey
  });
};

test('integration flow: connect → perceive → move → action → vote', async () => {
  const worldState = new WorldStateManager();
  const registry = new MoltbotRegistry();
  const actionQueue = new ActionQueue(worldState, registry);
  const economy = new EconomyManager(worldState);
  const voting = new VotingManager(worldState, { emit: () => {} });

  const agent = await createAgent(registry, 'FlowBot', 'flow-key');
  const spawn = worldState.getRandomSpawnPosition();
  worldState.addAgent(agent.id, spawn);
  economy.registerAgent(agent.id);

  const view = worldState.getAgentView(agent.id);
  assert.ok(view?.position);

  const targetX = worldState.isWalkable(spawn.x + 1, spawn.y) ? spawn.x + 1 : spawn.x;
  const targetY = spawn.y;
  await actionQueue.enqueue({ type: 'MOVE_TO', agentId: agent.id, targetX, targetY, timestamp: Date.now() });
  await actionQueue.enqueue({
    type: 'ACTION',
    agentId: agent.id,
    actionType: 'interact_object',
    target: 'bench',
    params: { mood: 'test' },
    timestamp: Date.now()
  });

  await actionQueue.processQueue();

  const vote = voting.startVote();
  assert.ok(vote?.options?.length);
  const summary = voting.castVote(agent.id, vote.options[0].id);
  assert.equal(summary.id, vote.id);
});

test('load simulation: multiple agents enqueue actions', async () => {
  const worldState = new WorldStateManager();
  const registry = new MoltbotRegistry();
  const actionQueue = new ActionQueue(worldState, registry);

  const agentCount = 25;
  for (let i = 0; i < agentCount; i += 1) {
    const agent = await registry.registerAgent({
      id: `load-${i}`,
      name: `LoadBot-${i}`,
      avatar: 'char1',
      socketId: `socket-${i}`,
      apiKey: `key-${i}`
    });
    const spawn = worldState.getRandomSpawnPosition();
    worldState.addAgent(agent.id, spawn);
    await actionQueue.enqueue({
      type: 'MOVE_TO',
      agentId: agent.id,
      targetX: spawn.x,
      targetY: spawn.y,
      timestamp: Date.now()
    });
    await actionQueue.enqueue({
      type: 'ACTION',
      agentId: agent.id,
      actionType: 'interact_object',
      target: `object-${i}`,
      params: { index: i },
      timestamp: Date.now()
    });
  }

  await actionQueue.processQueue();
  assert.equal(actionQueue.getQueueLength(), 0);
});

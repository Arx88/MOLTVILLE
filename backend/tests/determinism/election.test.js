import test from 'node:test';
import assert from 'node:assert/strict';
import { VotingManager } from '../../core/VotingManager.js';

const createWorldStateStub = () => ({
  lots: [
    { id: 'lot-1', district: 'central' },
    { id: 'lot-2', district: 'north' }
  ],
  agents: new Map([['a', {}], ['b', {}], ['c', {}]]),
  addBuildingFromLot: ({ id, name, type, lotId }) => ({ id, name, type, lotId })
});

const createIoStub = () => ({ emit: () => {} });

const withRandomSequence = (sequence, fn) => {
  const originalRandom = Math.random;
  let index = 0;
  Math.random = () => {
    const value = sequence[index % sequence.length];
    index += 1;
    return value;
  };
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
};

const runDeterministicVote = (sequence) => withRandomSequence(sequence, () => {
  const worldState = createWorldStateStub();
  const manager = new VotingManager(worldState, createIoStub(), {
    catalog: [
      { id: 'cafe', name: 'Cafe', type: 'cafe', district: 'central' },
      { id: 'market', name: 'Market', type: 'shop', district: 'central' },
      { id: 'park', name: 'Park', type: 'park', district: 'north' },
      { id: 'library', name: 'Library', type: 'civic', district: 'central' }
    ]
  });
  manager.startVote();
  return manager.getVoteSummary();
});

test('voting manager startVote is deterministic for 10 runs with fixed random stream', () => {
  const sequence = [0.1, 0.8, 0.3, 0.6, 0.2, 0.9];
  const runs = Array.from({ length: 10 }, () => runDeterministicVote(sequence));

  assert.equal(runs.length, 10);
  const first = runs[0];
  assert.ok(first.options.length > 0);

  for (let i = 1; i < runs.length; i += 1) {
    assert.equal(runs[i].lotId, first.lotId, `run ${i + 1} should keep same lot`);
    assert.deepEqual(
      runs[i].options.map((option) => option.id),
      first.options.map((option) => option.id),
      `run ${i + 1} should keep same option ordering`
    );
  }
});

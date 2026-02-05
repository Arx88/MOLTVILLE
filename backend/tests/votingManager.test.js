import test from 'node:test';
import assert from 'node:assert/strict';
import { VotingManager } from '../core/VotingManager.js';

test('VotingManager.buildVoteOptions uses proposals first', () => {
  process.env.BUILDING_VOTE_OPTIONS = '2';
  const worldState = { agents: new Map(), lots: [{ id: 'lot-1', district: 'central' }] };
  const io = { emit: () => {} };
  const catalog = [
    { id: 'cafe', name: 'Café', type: 'cafe', districts: ['central'] },
    { id: 'library', name: 'Library', type: 'library', districts: ['central'] }
  ];
  const manager = new VotingManager(worldState, io, { catalog });
  manager.pendingProposals = [{
    id: 'proposal-1',
    agentId: 'agent-1',
    templateId: 'custom-house',
    name: 'Casa Azul',
    type: 'house',
    district: 'central',
    createdAt: Date.now()
  }];

  const options = manager.buildVoteOptions('central', 0);
  assert.equal(options.length, 2);
  assert.equal(options[0].source, 'proposal');
  assert.equal(options[0].name, 'Casa Azul');
});

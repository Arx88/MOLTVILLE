import test from 'node:test';
import assert from 'node:assert/strict';

import { WorldStateManager } from '../core/WorldStateManager.js';
import { EconomyManager } from '../core/EconomyManager.js';
import { GovernanceManager } from '../core/GovernanceManager.js';
import { VotingManager } from '../core/VotingManager.js';

const createIoStub = () => ({ emit() {}, to() { return { emit() {} }; } });

test('Voting proposals support approval and veto flow', () => {
  const io = createIoStub();
  const worldState = new WorldStateManager();
  const economy = new EconomyManager(worldState, { io });
  const governance = new GovernanceManager(io);
  governance.currentPresident = { agentId: 'president-1', name: 'President' };

  const voting = new VotingManager(worldState, io, { economyManager: economy, governanceManager: governance });

  const created = voting.proposeBuilding({
    agentId: 'agent-1',
    templateId: 'cafe-roca',
    proposalType: 'ciudadana',
    reason: 'Need food services'
  });
  assert.equal(created.mode, 'vote');
  assert.equal(created.proposal.status, 'pending');

  const supported = voting.supportProposal({
    proposalId: created.proposal.id,
    agentId: 'agent-2',
    support: true,
    reason: 'Agree'
  });
  assert.equal(supported.status, 'approved');

  const vetoed = voting.vetoProposal({
    proposalId: created.proposal.id,
    presidentAgentId: 'president-1',
    reason: 'Budget hold'
  });
  assert.equal(vetoed.status, 'vetoed');
});

test('Voting proposals enforce private/state/cooperative constraints', () => {
  const io = createIoStub();
  const worldState = new WorldStateManager();
  const economy = new EconomyManager(worldState, { io });
  const governance = new GovernanceManager(io);
  governance.currentPresident = { agentId: 'president-1', name: 'President' };

  const voting = new VotingManager(worldState, io, { economyManager: economy, governanceManager: governance });

  economy.registerAgent('investor-1');
  economy.incrementBalance('investor-1', 500, 'test_seed');

  const privateBuild = voting.proposeBuilding({
    agentId: 'investor-1',
    templateId: 'cafe-roca',
    proposalType: 'inversion_privada',
    cost: 120
  });
  assert.equal(privateBuild.mode, 'direct');
  assert.ok(privateBuild.building);

  const stateBuild = voting.proposeBuilding({
    agentId: 'president-1',
    templateId: 'library-azul',
    proposalType: 'proyecto_estatal',
    cost: 0
  });
  assert.equal(stateBuild.mode, 'direct');
  assert.ok(stateBuild.building);

  const coop = voting.proposeBuilding({
    agentId: 'agent-1',
    templateId: 'market-plaza',
    proposalType: 'cooperativa',
    coProposers: ['agent-2', 'agent-3'],
    reason: 'Collective effort'
  });
  assert.equal(coop.mode, 'vote');

  assert.throws(() => voting.proposeBuilding({
    agentId: 'agent-2',
    templateId: 'plaza-circulo',
    proposalType: 'proyecto_estatal',
    cost: 20
  }));
});

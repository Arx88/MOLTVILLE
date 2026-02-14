import test from 'node:test';
import assert from 'node:assert/strict';

import { GovernanceManager } from '../core/GovernanceManager.js';

test('GovernanceManager no-confidence pass triggers early election', () => {
  const emitted = [];
  const io = {
    emit(event, payload) {
      emitted.push({ event, payload });
    }
  };

  const manager = new GovernanceManager(io);
  manager.currentPresident = {
    agentId: 'president-1',
    name: 'Presi',
    platform: 'tax cut',
    electedAt: Date.now()
  };

  manager.startNoConfidenceVote({ initiatorId: 'agent-1', totalActiveAgents: 4, durationMs: 60_000 });
  manager.castNoConfidenceVote({ agentId: 'agent-1', support: true });
  manager.castNoConfidenceVote({ agentId: 'agent-2', support: true });
  manager.castNoConfidenceVote({ agentId: 'agent-3', support: true });

  const result = manager.resolveNoConfidenceVote(4);

  assert.equal(result.passed, true);
  assert.equal(manager.currentPresident, null);
  assert.ok(manager.getElectionSummary());
  assert.ok(emitted.some((entry) => entry.event === 'governance:no_confidence_passed'));
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { FavorLedger } from '../core/FavorLedger.js';

test('FavorLedger applies overdue penalties and updates risk profile', () => {
  const ledger = new FavorLedger();
  const reputationCalls = [];
  const relationshipCalls = [];

  const now = Date.now();
  ledger.createFavor({
    from: 'debtor-1',
    to: 'creditor-1',
    value: 2,
    reason: 'job vote',
    dueAt: now - 1000
  });

  const tickResult = ledger.applyTick({
    now: now + (2 * 60 * 60 * 1000),
    reputationManager: {
      adjust(agentId, delta, context) {
        reputationCalls.push({ agentId, delta, context });
      }
    },
    moltbotRegistry: {
      updateRelationship(from, to, delta, dimensions) {
        relationshipCalls.push({ from, to, delta, dimensions });
      }
    }
  });

  assert.equal(tickResult.overdueOpen, 1);
  assert.ok(tickResult.penalties.length >= 1);
  assert.ok(reputationCalls.length >= 2);
  assert.ok(relationshipCalls.length >= 2);

  const risk = ledger.getRiskProfile('debtor-1');
  assert.equal(risk.overdueDebts, 1);
  assert.equal(risk.isNegotiationBlocked, true);

  const gate = ledger.canNegotiate('debtor-1');
  assert.equal(gate.allowed, false);
  assert.equal(gate.reason, 'favor_default_risk');
});

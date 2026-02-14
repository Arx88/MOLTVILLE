import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAndValidateDecision } from '../core/AutonomyDecisionSchema.js';

test('AutonomyDecisionSchema validates a strict JSON decision', () => {
  const payload = JSON.stringify({
    goal: 'Conseguir empleo para estabilizar ingresos',
    thought: 'Hay trabajos abiertos y no tengo empleo',
    action: {
      type: 'apply_job',
      target: 'job-1',
      params: {}
    },
    utterance: 'Voy a postularme a este trabajo.',
    nextThinkMs: 9000
  });

  const parsed = parseAndValidateDecision(payload);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.value.action.type, 'apply_job');
  assert.equal(parsed.value.action.target, 'job-1');
});

test('AutonomyDecisionSchema rejects invalid action types', () => {
  const payload = JSON.stringify({
    goal: 'Hacer algo',
    action: {
      type: 'scripted_magic',
      params: {}
    }
  });

  const parsed = parseAndValidateDecision(payload);
  assert.equal(parsed.valid, false);
  assert.ok(parsed.errors.some((error) => error.startsWith('action_type_invalid')));
});

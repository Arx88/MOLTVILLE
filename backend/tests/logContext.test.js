import assert from 'node:assert/strict';
import test from 'node:test';

import { getLogContext, runWithLogContext } from '../utils/logContext.js';

test('runWithLogContext exposes scoped context', async () => {
  assert.equal(getLogContext(), null);
  await runWithLogContext({ tick_id: 101, correlation_id: 'tick-101' }, async () => {
    const context = getLogContext();
    assert.equal(context.tick_id, 101);
    assert.equal(context.correlation_id, 'tick-101');
  });
  assert.equal(getLogContext(), null);
});


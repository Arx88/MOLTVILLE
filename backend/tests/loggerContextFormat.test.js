import test from 'node:test';
import assert from 'node:assert/strict';

import { logContextFormat } from '../utils/logger.js';
import { runWithLogContext } from '../utils/logContext.js';

test('logContextFormat injects null tracing fields without context', () => {
  const formatter = logContextFormat();
  const info = formatter.transform({ level: 'info', message: 'hello' });

  assert.equal(info.tick_id, null);
  assert.equal(info.correlation_id, null);
  assert.equal(info.request_id, null);
});

test('logContextFormat injects active tracing context', async () => {
  const formatter = logContextFormat();

  await runWithLogContext({
    tick_id: 42,
    correlation_id: 'tick-42',
    request_id: 'req-42'
  }, async () => {
    const info = formatter.transform({ level: 'info', message: 'inside-context' });

    assert.equal(info.tick_id, 42);
    assert.equal(info.correlation_id, 'tick-42');
    assert.equal(info.request_id, 'req-42');
  });
});

test('logContextFormat does not overwrite explicit tracing fields', async () => {
  const formatter = logContextFormat();

  await runWithLogContext({
    tick_id: 77,
    correlation_id: 'tick-77',
    request_id: 'req-77'
  }, async () => {
    const info = formatter.transform({
      level: 'info',
      message: 'explicit-values',
      correlation_id: 'manual-correlation'
    });

    assert.equal(info.tick_id, 77);
    assert.equal(info.correlation_id, 'manual-correlation');
    assert.equal(info.request_id, 'req-77');
  });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';

import { FeatureFlags } from '../core/FeatureFlags.js';
import flagsRoutes from '../routes/flags.js';
import { config } from '../utils/config.js';

const buildHeaders = () => {
  const headers = { 'content-type': 'application/json' };
  if (config.adminApiKey) {
    headers['x-admin-key'] = config.adminApiKey;
  }
  return headers;
};

const createServer = () => {
  const app = express();
  app.use(express.json());
  app.locals.coreFlags = new FeatureFlags();
  app.locals.featureFlags = {
    REPUTATION_ENGINE_ENABLED: true
  };
  app.use('/api/flags', flagsRoutes);
  const server = app.listen(0);
  const port = server.address().port;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
};

test('GET /api/flags returns core and legacy flags', async () => {
  const { server, baseUrl } = createServer();
  try {
    const response = await fetch(`${baseUrl}/api/flags`, {
      headers: buildHeaders()
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.ok(payload.flags.core['telemetry.enabled'] !== undefined);
    assert.equal(payload.flags.legacy.REPUTATION_ENGINE_ENABLED, true);
  } finally {
    server.close();
  }
});

test('POST /api/flags/set toggles runtime core flag', async () => {
  const { server, baseUrl } = createServer();
  try {
    const response = await fetch(`${baseUrl}/api/flags/set`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        scope: 'core',
        flag: 'telemetry.enabled',
        enabled: false,
        reason: 'test'
      })
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.updated.enabled, false);
    assert.equal(payload.flags.core['telemetry.enabled'], false);
  } finally {
    server.close();
  }
});

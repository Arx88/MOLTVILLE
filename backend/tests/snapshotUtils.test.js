import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  getSnapshotStats,
  loadSnapshotFile,
  resolveSnapshotPath,
  saveSnapshotFile
} from '../utils/snapshot.js';

test('snapshot helpers save, load, and report stats', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'moltville-snapshots-'));
  try {
    const snapshotPath = resolveSnapshotPath(path.join(tempDir, 'nested', 'snapshot.json'));
    const payload = { version: 1, createdAt: Date.now(), world: { tickCount: 42 } };

    await saveSnapshotFile(snapshotPath, payload);
    const loaded = await loadSnapshotFile(snapshotPath);
    const stats = await getSnapshotStats(snapshotPath);

    assert.deepEqual(loaded, payload);
    assert.ok(stats.size > 0);
    assert.ok(stats.modifiedAt > 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

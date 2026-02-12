import express from 'express';
import { requireAdminKey } from '../utils/adminAuth.js';
import { requireViewerKey } from '../utils/viewerAuth.js';
import { config } from '../utils/config.js';
import {
  getSnapshotStats,
  loadSnapshotFile,
  resolveSnapshotPath,
  saveSnapshotFile
} from '../utils/snapshot.js';
import { loadLatestSnapshotDb, saveSnapshotDb } from '../utils/snapshotDb.js';

const router = express.Router();

// Get full world state
router.get('/state', requireViewerKey, async (req, res) => {
  try {
    const { worldState, cityMoodManager, eventManager } = req.app.locals;
    res.json({
      ...worldState.getFullState(),
      mood: cityMoodManager.getSummary(),
      events: eventManager?.getSummary?.() || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get buildings
router.get('/buildings', requireViewerKey, async (req, res) => {
  try {
    const { worldState } = req.app.locals;
    res.json(worldState.buildings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get available lots
router.get('/lots', requireViewerKey, async (req, res) => {
  try {
    const { worldState } = req.app.locals;
    res.json(worldState.lots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get building info
router.get('/buildings/:buildingId', requireViewerKey, async (req, res) => {
  try {
    const { buildingId } = req.params;
    const { worldState } = req.app.locals;
    
    const building = worldState.buildings.find(b => b.id === buildingId);
    if (!building) {
      return res.status(404).json({ error: 'Building not found' });
    }

    res.json(building);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get social network
router.get('/social-network', requireViewerKey, async (req, res) => {
  try {
    const { interactionEngine } = req.app.locals;
    const network = interactionEngine.getSocialNetwork();
    res.json(network);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active conversations
router.get('/conversations', requireViewerKey, async (req, res) => {
  try {
    const { interactionEngine } = req.app.locals;
    const conversations = interactionEngine.getActiveConversations();
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/snapshot', requireAdminKey, async (req, res) => {
  try {
    const {
      worldState,
      moltbotRegistry,
      actionQueue,
      economyManager,
      eventManager,
      interactionEngine,
      aestheticsManager,
      cityMoodManager,
      governanceManager,
      votingManager,
      coordinationManager
    } = req.app.locals;
    const snapshot = {
      ...worldState.createSnapshot(),
      registry: moltbotRegistry.createSnapshot(),
      actionQueue: actionQueue.createSnapshot(),
      economy: economyManager.createSnapshot(),
      events: eventManager.createSnapshot(),
      conversations: interactionEngine.createSnapshot(),
      aesthetics: aestheticsManager.createSnapshot(),
      mood: cityMoodManager.createSnapshot(),
      governance: governanceManager.createSnapshot(),
      voting: votingManager.createSnapshot(),
      coordination: coordinationManager.createSnapshot()
    };
    const snapshotPath = resolveSnapshotPath(config.worldSnapshotPath);
    await saveSnapshotFile(snapshotPath, snapshot, {
      archiveDir: config.worldSnapshotArchiveDir,
      retention: config.worldSnapshotArchiveRetention,
      checksum: config.worldSnapshotArchiveChecksum
    });
    if (req.app.locals.db) {
      await saveSnapshotDb(req.app.locals.db, snapshot);
    }
    res.json({ success: true, path: snapshotPath, createdAt: snapshot.createdAt });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/snapshot/restore', requireAdminKey, async (req, res) => {
  try {
    const {
      worldState,
      moltbotRegistry,
      actionQueue,
      economyManager,
      eventManager,
      interactionEngine,
      aestheticsManager,
      cityMoodManager,
      governanceManager,
      votingManager,
      coordinationManager
    } = req.app.locals;
    const snapshotPath = resolveSnapshotPath(config.worldSnapshotPath);
    const snapshot = config.worldSnapshotSource === 'db'
      ? await loadLatestSnapshotDb(req.app.locals.db)
      : await loadSnapshotFile(snapshotPath);
    worldState.loadSnapshot(snapshot);
    moltbotRegistry.loadSnapshot(snapshot.registry);
    actionQueue.loadSnapshot(snapshot.actionQueue);
    economyManager.loadSnapshot(snapshot.economy);
    eventManager.loadSnapshot(snapshot.events);
    interactionEngine.loadSnapshot(snapshot.conversations);
    aestheticsManager.loadSnapshot(snapshot.aesthetics);
    cityMoodManager.loadSnapshot(snapshot.mood);
    governanceManager.loadSnapshot(snapshot.governance);
    votingManager.loadSnapshot(snapshot.voting);
    coordinationManager.loadSnapshot(snapshot.coordination);
    res.json({ success: true, restoredAt: Date.now() });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ success: false, error: 'Snapshot not found' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/snapshot/status', requireAdminKey, async (req, res) => {
  try {
    const snapshotPath = resolveSnapshotPath(config.worldSnapshotPath);
    const stats = await getSnapshotStats(snapshotPath);
    res.json({ exists: true, path: snapshotPath, ...stats });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.json({ exists: false, path: resolveSnapshotPath(config.worldSnapshotPath) });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

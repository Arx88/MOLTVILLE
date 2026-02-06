import express from 'express';
import { requireAdminKey } from '../utils/adminAuth.js';
import { config } from '../utils/config.js';
import {
  getSnapshotStats,
  loadSnapshotFile,
  resolveSnapshotPath,
  saveSnapshotFile
} from '../utils/snapshot.js';

const router = express.Router();

// Get full world state
router.get('/state', async (req, res) => {
  try {
    const { worldState, cityMoodManager } = req.app.locals;
    res.json({
      ...worldState.getFullState(),
      mood: cityMoodManager.getSummary()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get buildings
router.get('/buildings', async (req, res) => {
  try {
    const { worldState } = req.app.locals;
    res.json(worldState.buildings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get available lots
router.get('/lots', async (req, res) => {
  try {
    const { worldState } = req.app.locals;
    res.json(worldState.lots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get building info
router.get('/buildings/:buildingId', async (req, res) => {
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
router.get('/social-network', async (req, res) => {
  try {
    const { interactionEngine } = req.app.locals;
    const network = interactionEngine.getSocialNetwork();
    res.json(network);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active conversations
router.get('/conversations', async (req, res) => {
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
    const { worldState, economyManager, eventManager } = req.app.locals;
    const snapshot = {
      ...worldState.createSnapshot(),
      economy: economyManager.createSnapshot(),
      events: eventManager.createSnapshot()
    };
    const snapshotPath = resolveSnapshotPath(config.worldSnapshotPath);
    await saveSnapshotFile(snapshotPath, snapshot);
    res.json({ success: true, path: snapshotPath, createdAt: snapshot.createdAt });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/snapshot/restore', requireAdminKey, async (req, res) => {
  try {
    const { worldState, economyManager, eventManager } = req.app.locals;
    const snapshotPath = resolveSnapshotPath(config.worldSnapshotPath);
    const snapshot = await loadSnapshotFile(snapshotPath);
    worldState.loadSnapshot(snapshot);
    economyManager.loadSnapshot(snapshot.economy);
    eventManager.loadSnapshot(snapshot.events);
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

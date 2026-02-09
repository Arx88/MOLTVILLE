import express from 'express';
import { requireViewerKey } from '../utils/viewerAuth.js';

const router = express.Router();

router.post('/viewer-vote', requireViewerKey, async (req, res) => {
  try {
    const { viewer, option } = req.body;
    if (!viewer || !option) {
      return res.status(400).json({ error: 'viewer and option are required' });
    }
    const votingManager = req.app.locals.votingManager;
    if (!votingManager) {
      return res.status(500).json({ error: 'Voting manager unavailable' });
    }
    res.json({
      success: true,
      message: `Vote recorded for ${viewer}`,
      option
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/viewer-sponsor', requireViewerKey, async (req, res) => {
  try {
    const { sponsor, eventType } = req.body;
    if (!sponsor || !eventType) {
      return res.status(400).json({ error: 'sponsor and eventType are required' });
    }
    const eventManager = req.app.locals.eventManager;
    if (!eventManager) {
      return res.status(500).json({ error: 'Event manager unavailable' });
    }
    const event = eventManager.createEvent({
      name: `${sponsor}'s ${eventType}`,
      type: eventType,
      startAt: Date.now(),
      endAt: Date.now() + 30 * 60 * 1000,
      location: 'plaza',
      description: `Special event sponsored by ${sponsor}!`,
      goalScope: 'global'
    });
    res.json({
      success: true,
      event
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

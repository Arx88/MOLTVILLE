import express from 'express';
import { requireAdminKey } from '../utils/adminAuth.js';

const router = express.Router();

// Simplified auth - in production use proper JWT
router.post('/verify', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return res.status(400).json({ error: 'API key is required' });
    }
    const { moltbotRegistry } = req.app.locals;
    
    const normalizedKey = apiKey.trim();
    const agent = moltbotRegistry.getAgentByApiKey(normalizedKey);
    
    if (!agent) {
      if (!moltbotRegistry.isApiKeyIssued(normalizedKey)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
      return res.json({
        valid: true,
        agentId: null,
        agentName: null
      });
    }

    res.json({
      valid: true,
      agentId: agent.id,
      agentName: agent.name
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/keys', requireAdminKey, async (req, res) => {
  try {
    const { moltbotRegistry } = req.app.locals;
    const keys = await moltbotRegistry.listApiKeys();
    res.json({ keys });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/keys/events', requireAdminKey, async (req, res) => {
  try {
    const { moltbotRegistry } = req.app.locals;
    const limit = Number(req.query.limit) || 50;
    const events = await moltbotRegistry.listApiKeyEvents(limit);
    res.json({ events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

import express from 'express';

const router = express.Router();

// Simplified auth - in production use proper JWT
router.post('/verify', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return res.status(400).json({ error: 'API key is required' });
    }
    const { moltbotRegistry } = req.app.locals;
    
    const agent = moltbotRegistry.getAgentByApiKey(apiKey.trim());
    
    if (!agent) {
      return res.status(401).json({ error: 'Invalid API key' });
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

export default router;

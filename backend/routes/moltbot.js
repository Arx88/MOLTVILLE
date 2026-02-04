import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Generate API key for new moltbot
router.post('/generate-key', async (req, res) => {
  try {
    const { moltbotName } = req.body;
    
    if (typeof moltbotName !== 'string' || moltbotName.trim().length === 0) {
      return res.status(400).json({ error: 'Moltbot name is required' });
    }

    const trimmedName = moltbotName.trim();
    const apiKey = `moltville_${uuidv4().replace(/-/g, '')}`;
    const { moltbotRegistry } = req.app.locals;
    moltbotRegistry.issueApiKey(apiKey);

    // In production, store this in database
    res.json({
      apiKey,
      moltbotName: trimmedName,
      createdAt: Date.now(),
      instructions: {
        websocket: `ws://localhost:${process.env.PORT || 3001}`,
        event: 'agent:connect',
        payload: {
          apiKey,
          agentId: uuidv4(),
          agentName: trimmedName,
          avatar: 'char1'
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get agent info
router.get('/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { moltbotRegistry } = req.app.locals;
    
    const agent = moltbotRegistry.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      connectedAt: agent.connectedAt,
      lastSeen: agent.lastSeen,
      stats: agent.stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get agent memory
router.get('/:agentId/memory', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { type, limit } = req.query;
    const { moltbotRegistry } = req.app.locals;
    
    const memory = moltbotRegistry.getAgentMemory(
      agentId,
      type || null,
      parseInt(limit) || 10
    );
    
    if (!memory) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json(memory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get agent relationships
router.get('/:agentId/relationships', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { moltbotRegistry } = req.app.locals;
    
    const agent = moltbotRegistry.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const relationships = Object.entries(agent.memory.relationships).map(([otherId, rel]) => {
      const other = moltbotRegistry.getAgent(otherId);
      return {
        agentId: otherId,
        agentName: other ? other.name : 'Unknown',
        affinity: rel.affinity,
        interactions: rel.interactions,
        lastInteraction: rel.lastInteraction
      };
    });

    res.json(relationships);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all agents
router.get('/', async (req, res) => {
  try {
    const { moltbotRegistry } = req.app.locals;
    const agents = moltbotRegistry.getAllAgents();
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

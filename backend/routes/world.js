import express from 'express';

const router = express.Router();

// Get full world state
router.get('/state', async (req, res) => {
  try {
    const { worldState } = req.app.locals;
    res.json(worldState.getFullState());
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

export default router;

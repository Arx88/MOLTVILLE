import express from 'express';

const router = express.Router();

router.get('/current', (req, res) => {
  const { votingManager } = req.app.locals;
  res.json({ vote: votingManager.getVoteSummary() });
});

router.post('/cast', (req, res) => {
  const { agentId, optionId } = req.body;
  const { votingManager } = req.app.locals;
  const { moltbotRegistry } = req.app.locals;
  if (!agentId || !optionId) {
    return res.status(400).json({ success: false, error: 'agentId and optionId are required' });
  }
  if (!moltbotRegistry.getAgent(agentId)) {
    return res.status(400).json({ success: false, error: 'Agent not found' });
  }
  try {
    const summary = votingManager.castVote(agentId, optionId);
    res.json({ success: true, vote: summary });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;

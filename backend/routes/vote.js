import express from 'express';

const router = express.Router();

router.get('/current', (req, res) => {
  const { votingManager } = req.app.locals;
  res.json({ vote: votingManager.getVoteSummary() });
});

router.get('/catalog', (req, res) => {
  const { votingManager } = req.app.locals;
  res.json({ catalog: votingManager.listCatalog() });
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

router.get('/history', async (req, res) => {
  const { votingManager } = req.app.locals;
  const limit = parseInt(req.query.limit, 10) || 5;
  try {
    const history = await votingManager.getVoteHistory(limit);
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/propose', (req, res) => {
  const { agentId, templateId, customName, districtId, type } = req.body;
  const { votingManager } = req.app.locals;
  try {
    const proposal = votingManager.proposeBuilding({ agentId, templateId, customName, districtId, type });
    res.json({ success: true, proposal });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
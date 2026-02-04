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
  try {
    const summary = votingManager.castVote(agentId, optionId);
    res.json({ success: true, vote: summary });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
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

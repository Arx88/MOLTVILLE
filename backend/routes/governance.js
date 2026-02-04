import express from 'express';

const router = express.Router();

router.get('/current', (req, res) => {
  const { governanceManager } = req.app.locals;
  res.json({
    proposal: governanceManager.getCurrentProposal(),
    policies: governanceManager.getPolicySummary()
  });
});

router.post('/proposals', (req, res) => {
  const { title, description, changes, createdBy } = req.body;
  const { governanceManager } = req.app.locals;
  try {
    const proposal = governanceManager.createProposal({
      title,
      description,
      changes,
      createdBy
    });
    res.json({ success: true, proposal });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/vote', (req, res) => {
  const { agentId, vote } = req.body;
  const { governanceManager } = req.app.locals;
  try {
    const summary = governanceManager.castVote(agentId, vote);
    res.json({ success: true, proposal: summary });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;

import express from 'express';

const router = express.Router();

router.get('/current', (req, res) => {
  const { governanceManager } = req.app.locals;
  res.json(governanceManager.getSummary());
});

router.post('/candidate', (req, res) => {
  const { agentId, name, platform } = req.body;
  const { governanceManager, reputationManager } = req.app.locals;
  try {
    const summary = governanceManager.registerCandidate(agentId, name, platform, reputationManager);
    res.json({ success: true, election: summary });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/vote', (req, res) => {
  const { agentId, candidateId } = req.body;
  const { governanceManager } = req.app.locals;
  try {
    const summary = governanceManager.castVote(agentId, candidateId);
    res.json({ success: true, election: summary });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/policies', (req, res) => {
  const { type, value, durationMs, description } = req.body;
  const { governanceManager } = req.app.locals;
  try {
    const policy = governanceManager.setPolicy({
      type,
      value,
      durationMs: durationMs ? Number(durationMs) : null,
      description
    });
    res.json({ success: true, policy });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;

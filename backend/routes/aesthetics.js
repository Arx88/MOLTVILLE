import express from 'express';

export function createAestheticsRouter({ aestheticsManager }) {
  const router = express.Router();

  router.get('/current', (req, res) => {
    res.json({ vote: aestheticsManager.getVoteSummary() });
  });

  router.post('/vote', (req, res) => {
    const { agentId, optionId } = req.body || {};
    if (!agentId || !optionId) {
      return res.status(400).json({ success: false, error: 'agentId y optionId son obligatorios.' });
    }
    try {
      const vote = aestheticsManager.castVote({ agentId, optionId });
      return res.json({ success: true, vote });
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
  });

  router.get('/history', (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json({ history: aestheticsManager.getHistory(limit) });
  });

  router.get('/meta', (req, res) => {
    res.json({ meta: aestheticsManager.getMeta() });
  });

  return router;
}

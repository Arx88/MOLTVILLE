import express from 'express';

const router = express.Router();

router.get('/balance/:agentId', (req, res) => {
  const { agentId } = req.params;
  const economy = req.app.locals.economyManager;
  const balance = economy.getBalance(agentId);
  res.json({ agentId, balance });
});

router.get('/jobs', (req, res) => {
  const economy = req.app.locals.economyManager;
  res.json({ jobs: economy.listJobs() });
});

router.post('/jobs/apply', (req, res) => {
  const { agentId, jobId } = req.body;
  const economy = req.app.locals.economyManager;
  try {
    const job = economy.applyForJob(agentId, jobId);
    res.json({ success: true, job });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/reviews', (req, res) => {
  const { agentId, reviewerId, score, tags, reason } = req.body;
  const economy = req.app.locals.economyManager;
  try {
    const result = economy.submitReview({
      agentId,
      reviewerId,
      score: parseFloat(score),
      tags,
      reason
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/reviews/:agentId', (req, res) => {
  const { agentId } = req.params;
  const economy = req.app.locals.economyManager;
  res.json({ agentId, reviews: economy.getReviews(agentId) });
});

router.get('/properties', (req, res) => {
  const economy = req.app.locals.economyManager;
  res.json({ properties: economy.listProperties() });
});

router.post('/properties/buy', (req, res) => {
  const { agentId, propertyId } = req.body;
  const economy = req.app.locals.economyManager;
  try {
    const property = economy.buyProperty(agentId, propertyId);
    res.json({ success: true, property });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/properties/list', (req, res) => {
  const { agentId, propertyId, price } = req.body;
  const economy = req.app.locals.economyManager;
  try {
    const property = economy.listPropertyForSale(agentId, propertyId, parseFloat(price));
    res.json({ success: true, property });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/transactions/:agentId', (req, res) => {
  const { agentId } = req.params;
  const economy = req.app.locals.economyManager;
  res.json({ agentId, transactions: economy.getTransactions(agentId) });
});

export default router;

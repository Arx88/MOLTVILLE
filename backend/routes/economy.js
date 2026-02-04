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
  if (!agentId || !jobId) {
    return res.status(400).json({ success: false, error: 'agentId and jobId are required' });
  }
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
  if (!agentId || !reviewerId || score === undefined) {
    return res.status(400).json({ success: false, error: 'agentId, reviewerId, and score are required' });
  }
  const numericScore = parseFloat(score);
  if (Number.isNaN(numericScore)) {
    return res.status(400).json({ success: false, error: 'score must be a number' });
  }
  if (numericScore < 0 || numericScore > 5) {
    return res.status(400).json({ success: false, error: 'score must be between 0 and 5' });
  }
  try {
    const result = economy.submitReview({
      agentId,
      reviewerId,
      score: numericScore,
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
  if (!agentId || !propertyId) {
    return res.status(400).json({ success: false, error: 'agentId and propertyId are required' });
  }
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
  if (!agentId || !propertyId || price === undefined) {
    return res.status(400).json({ success: false, error: 'agentId, propertyId, and price are required' });
  }
  const numericPrice = parseFloat(price);
  if (Number.isNaN(numericPrice)) {
    return res.status(400).json({ success: false, error: 'price must be a number' });
  }
  if (numericPrice <= 0) {
    return res.status(400).json({ success: false, error: 'price must be positive' });
  }
  try {
    const property = economy.listPropertyForSale(agentId, propertyId, numericPrice);
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
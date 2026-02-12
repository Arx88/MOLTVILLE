import express from 'express';
import { requireAdminKeyWithSuccess } from '../utils/adminAuth.js';
import { requireAgentKey } from '../utils/agentAuth.js';
import { JoiHelpers, validateBody } from '../utils/validation.js';

const router = express.Router();
const { Joi } = JoiHelpers;

const applyJobSchema = Joi.object({
  agentId: Joi.string().trim().required(),
  jobId: Joi.string().trim().required()
});

const reviewSchema = Joi.object({
  agentId: Joi.string().trim().required(),
  reviewerId: Joi.string().trim().required(),
  score: Joi.number().min(0).max(5).required(),
  tags: Joi.array().items(Joi.string().trim()).default([]),
  reason: Joi.string().allow('').default('')
});

const jobVoteSchema = Joi.object({
  applicantId: Joi.string().trim().required(),
  voterId: Joi.string().trim().required(),
  jobId: Joi.string().trim().required()
});

const propertyBuySchema = Joi.object({
  agentId: Joi.string().trim().required(),
  propertyId: Joi.string().trim().required()
});

const propertyListSchema = Joi.object({
  agentId: Joi.string().trim().required(),
  propertyId: Joi.string().trim().required(),
  price: Joi.number().positive().required()
});

const inventoryAddSchema = Joi.object({
  agentId: Joi.string().trim().required(),
  itemId: Joi.string().trim().required(),
  name: Joi.string().trim().allow('', null),
  quantity: Joi.number().positive().default(1)
});

const inventoryRemoveSchema = Joi.object({
  agentId: Joi.string().trim().required(),
  itemId: Joi.string().trim().required(),
  quantity: Joi.number().positive().default(1)
});

router.get('/balance/:agentId', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.params.agentId
}), (req, res) => {
  const { agentId } = req.params;
  const economy = req.app.locals.economyManager;
  const balance = economy.getBalance(agentId);
  res.json({ agentId, balance });
});

router.get('/jobs', (req, res) => {
  const economy = req.app.locals.economyManager;
  res.json({ jobs: economy.listJobs() });
});

router.get('/jobs/applications/:agentId', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.params.agentId
}), (req, res) => {
  const { agentId } = req.params;
  const economy = req.app.locals.economyManager;
  res.json({ application: economy.getApplicationForAgent(agentId) });
});

router.post('/jobs/apply', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.body?.agentId
}), validateBody(applyJobSchema), (req, res) => {
  const { agentId, jobId } = req.body;
  const economy = req.app.locals.economyManager;
  try {
    const job = economy.applyForJob(agentId, jobId);
    res.json({ success: true, job });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/jobs/vote', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.body?.voterId
}), validateBody(jobVoteSchema), (req, res) => {
  const { applicantId, voterId, jobId } = req.body;
  const economy = req.app.locals.economyManager;
  const reputationManager = req.app.locals.reputationManager;
  const moltbotRegistry = req.app.locals.moltbotRegistry;
  try {
    const result = economy.voteForJob({ applicantId, voterId, jobId, reputationManager, moltbotRegistry });
    res.json({ success: true, result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/reviews', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.body?.reviewerId
}), validateBody(reviewSchema), (req, res) => {
  const { agentId, reviewerId, score, tags, reason } = req.body;
  const economy = req.app.locals.economyManager;
  try {
    const result = economy.submitReview({
      agentId,
      reviewerId,
      score,
      tags,
      reason
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/reviews/:agentId', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.params.agentId
}), (req, res) => {
  const { agentId } = req.params;
  const economy = req.app.locals.economyManager;
  res.json({ agentId, reviews: economy.getReviews(agentId) });
});

router.get('/properties', (req, res) => {
  const economy = req.app.locals.economyManager;
  res.json({ properties: economy.listProperties() });
});

router.post('/properties/buy', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.body?.agentId
}), validateBody(propertyBuySchema), (req, res) => {
  const { agentId, propertyId } = req.body;
  const economy = req.app.locals.economyManager;
  try {
    const property = economy.buyProperty(agentId, propertyId);
    res.json({ success: true, property });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/properties/list', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.body?.agentId
}), validateBody(propertyListSchema), (req, res) => {
  const { agentId, propertyId, price } = req.body;
  const economy = req.app.locals.economyManager;
  try {
    const property = economy.listPropertyForSale(agentId, propertyId, price);
    res.json({ success: true, property });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/transactions/:agentId', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.params.agentId
}), (req, res) => {
  const { agentId } = req.params;
  const economy = req.app.locals.economyManager;
  res.json({ agentId, transactions: economy.getTransactions(agentId) });
});

router.get('/inventory/:agentId/transactions', requireAdminKeyWithSuccess, (req, res) => {
  const { agentId } = req.params;
  const economy = req.app.locals.economyManager;
  const limit = Number(req.query.limit) || 100;
  res.json({ agentId, transactions: economy.getItemTransactionsForAgent(agentId, limit) });
});

router.get('/inventory/:agentId', requireAdminKeyWithSuccess, (req, res) => {
  const { agentId } = req.params;
  const economy = req.app.locals.economyManager;
  res.json({ agentId, inventory: economy.getInventory(agentId) });
});

router.get('/inventory', requireAdminKeyWithSuccess, (req, res) => {
  const economy = req.app.locals.economyManager;
  res.json({ inventories: economy.getAllInventories() });
});

router.get('/inventory/transactions', requireAdminKeyWithSuccess, (req, res) => {
  const economy = req.app.locals.economyManager;
  const limit = Number(req.query.limit) || 100;
  res.json({ transactions: economy.getItemTransactions(limit) });
});

router.post('/inventory/add', requireAdminKeyWithSuccess, validateBody(inventoryAddSchema), (req, res) => {
  const { agentId, itemId, name, quantity } = req.body;
  const economy = req.app.locals.economyManager;
  try {
    const item = economy.addItem(agentId, { itemId, name, quantity });
    res.json({ success: true, item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/inventory/remove', requireAdminKeyWithSuccess, validateBody(inventoryRemoveSchema), (req, res) => {
  const { agentId, itemId, quantity } = req.body;
  const economy = req.app.locals.economyManager;
  try {
    const item = economy.removeItem(agentId, { itemId, quantity });
    res.json({ success: true, item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/inventory/consume', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.body?.agentId
}), validateBody(inventoryRemoveSchema), (req, res) => {
  const { agentId, itemId, quantity } = req.body;
  const economy = req.app.locals.economyManager;
  try {
    const item = economy.removeItem(agentId, { itemId, quantity });
    res.json({ success: true, item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;

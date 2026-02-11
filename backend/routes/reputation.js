import express from 'express';
import { requireAgentKey } from '../utils/agentAuth.js';
import { JoiHelpers, validateBody } from '../utils/validation.js';
import { ReputationEvents } from '../core/ReputationManager.js';

const router = express.Router();
const { Joi } = JoiHelpers;

const eventSchema = Joi.object({
  agentId: Joi.string().trim().required(),
  eventType: Joi.string().valid(...ReputationEvents).required(),
  metadata: Joi.object().default({})
});

router.get('/leaderboard', requireAgentKey({ allowAdmin: true, useSuccessResponse: true }), (req, res) => {
  const manager = req.app.locals.reputationManager;
  const limit = Number(req.query.limit || 25);
  res.json({ success: true, leaderboard: manager.leaderboard(limit) });
});

router.post('/event', requireAgentKey({ allowAdmin: true, useSuccessResponse: true, getAgentId: req => req.body?.agentId }), validateBody(eventSchema), (req, res) => {
  const manager = req.app.locals.reputationManager;
  try {
    const reputation = manager.applyEvent(req.body.agentId, req.body.eventType, req.body.metadata || {});
    res.json({ success: true, reputation });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/:agentId', requireAgentKey({ allowAdmin: true, useSuccessResponse: true, getAgentId: req => req.params.agentId }), (req, res) => {
  const { agentId } = req.params;
  const manager = req.app.locals.reputationManager;
  res.json({ success: true, agentId, reputation: manager.getSnapshot(agentId) });
});

export default router;

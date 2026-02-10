import express from 'express';
import { requireAgentKey } from '../utils/agentAuth.js';
import { JoiHelpers, validateBody } from '../utils/validation.js';

const router = express.Router();
const { Joi } = JoiHelpers;

const adjustSchema = Joi.object({
  agentId: Joi.string().trim().required(),
  delta: Joi.number().required(),
  districtId: Joi.string().allow('', null),
  role: Joi.string().allow('', null),
  reason: Joi.string().allow('', null)
});

router.get('/:agentId', requireAgentKey({ allowAdmin: true, useSuccessResponse: true, getAgentId: req => req.params.agentId }), (req, res) => {
  const { agentId } = req.params;
  const manager = req.app.locals.reputationManager;
  res.json({ agentId, reputation: manager.getSnapshot(agentId) });
});

router.post('/adjust', requireAgentKey({ allowAdmin: true, useSuccessResponse: true, getAgentId: req => req.body?.agentId }), validateBody(adjustSchema), (req, res) => {
  const { agentId, delta, districtId, role, reason } = req.body;
  const manager = req.app.locals.reputationManager;
  try {
    const reputation = manager.adjust(agentId, delta, { districtId, role, reason });
    res.json({ success: true, reputation });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;

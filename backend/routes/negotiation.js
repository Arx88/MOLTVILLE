import express from 'express';
import { requireAgentKey } from '../utils/agentAuth.js';
import { JoiHelpers, validateBody } from '../utils/validation.js';

const router = express.Router();
const { Joi } = JoiHelpers;

const proposeSchema = Joi.object({
  from: Joi.string().trim().required(),
  to: Joi.string().trim().required(),
  ask: Joi.object().required(),
  offer: Joi.object().required(),
  reason: Joi.string().allow('').default('')
});

const counterSchema = Joi.object({
  id: Joi.string().trim().required(),
  ask: Joi.object().optional(),
  offer: Joi.object().optional()
});

const acceptSchema = Joi.object({
  id: Joi.string().trim().required()
});

router.get('/:agentId', requireAgentKey({ allowAdmin: true, useSuccessResponse: true, getAgentId: req => req.params.agentId }), (req, res) => {
  const { agentId } = req.params;
  const service = req.app.locals.negotiationService;
  res.json({ agentId, negotiations: service.listForAgent(agentId) });
});

router.post('/propose', requireAgentKey({ allowAdmin: true, useSuccessResponse: true, getAgentId: req => req.body?.from }), validateBody(proposeSchema), (req, res) => {
  const service = req.app.locals.negotiationService;
  try {
    const negotiation = service.propose(req.body);
    res.json({ success: true, negotiation });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/counter', requireAgentKey({ allowAdmin: true, useSuccessResponse: true, getAgentId: req => req.body?.id }), validateBody(counterSchema), (req, res) => {
  const service = req.app.locals.negotiationService;
  try {
    const negotiation = service.counter(req.body.id, req.body);
    res.json({ success: true, negotiation });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/accept', requireAgentKey({ allowAdmin: true, useSuccessResponse: true, getAgentId: req => req.body?.id }), validateBody(acceptSchema), (req, res) => {
  const service = req.app.locals.negotiationService;
  try {
    const negotiation = service.accept(req.body.id);
    res.json({ success: true, negotiation });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;

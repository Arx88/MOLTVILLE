import express from 'express';
import { requireAgentKey } from '../utils/agentAuth.js';
import { JoiHelpers, validateBody } from '../utils/validation.js';

const router = express.Router();
const { Joi } = JoiHelpers;

const favorSchema = Joi.object({
  from: Joi.string().trim().required(),
  to: Joi.string().trim().required(),
  value: Joi.number().min(1).default(1),
  reason: Joi.string().allow('').default('')
});

router.get('/:agentId', requireAgentKey({ allowAdmin: true, useSuccessResponse: true, getAgentId: req => req.params.agentId }), (req, res) => {
  const { agentId } = req.params;
  const ledger = req.app.locals.favorLedger;
  res.json({ agentId, entries: ledger.listForAgent(agentId), summary: ledger.getSummary(agentId) });
});

router.post('/create', requireAgentKey({ allowAdmin: true, useSuccessResponse: true, getAgentId: req => req.body?.from }), validateBody(favorSchema), (req, res) => {
  const ledger = req.app.locals.favorLedger;
  try {
    const entry = ledger.createFavor(req.body);
    res.json({ success: true, entry });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/repay', requireAgentKey({ allowAdmin: true, useSuccessResponse: true, getAgentId: req => req.body?.from }), validateBody(favorSchema), (req, res) => {
  const ledger = req.app.locals.favorLedger;
  try {
    const result = ledger.repayFavor(req.body);
    res.json({ success: true, result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;

import express from 'express';
import { requireAgentKey } from '../utils/agentAuth.js';

const router = express.Router();

router.post('/declare', requireAgentKey({ allowAdmin: true, useSuccessResponse: true, getAgentId: req => req.body?.agentId || req.agent?.id }), (req, res) => {
  const manager = req.app.locals.commitmentManager;
  try {
    const commitment = manager.declare({
      agentId: req.body?.agentId || req.agent?.id,
      counterpartId: req.body?.counterpartId,
      text: req.body?.text,
      source: req.body?.source || 'dialog',
      semantic: req.body?.semantic || {},
      dueAt: req.body?.dueAt
    });
    res.status(201).json({ success: true, commitment });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/update', requireAgentKey({ allowAdmin: true, useSuccessResponse: true }), (req, res) => {
  const manager = req.app.locals.commitmentManager;
  try {
    const commitment = manager.update({
      commitmentId: req.body?.commitmentId,
      status: req.body?.status,
      progress: req.body?.progress,
      result: req.body?.result
    });
    res.json({ success: true, commitment });
  } catch (error) {
    res.status(error.message === 'Commitment not found' ? 404 : 400).json({ success: false, error: error.message });
  }
});

router.get('/mine', requireAgentKey({ allowAdmin: true, useSuccessResponse: true }), (req, res) => {
  const manager = req.app.locals.commitmentManager;
  const agentId = req.query.agentId || req.agent?.id;
  res.json({ success: true, commitments: manager.mine(agentId) });
});

export default router;

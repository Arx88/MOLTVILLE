import express from 'express';
import { requireAgentKey } from '../utils/agentAuth.js';

const router = express.Router();

router.get('/proposals', requireAgentKey({ allowAdmin: true, useSuccessResponse: true }), (req, res) => {
  const coordinationManager = req.app.locals.coordinationManager;
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : null;
  const mineOnly = req.query.mine === 'true';
  const limit = Number.parseInt(req.query.limit, 10) || 50;
  const proposals = coordinationManager.listProposals({
    status,
    agentId: mineOnly ? req.agent?.id : null,
    limit
  });
  res.json({ success: true, proposals });
});

router.get('/proposals/:proposalId', requireAgentKey({ allowAdmin: true, useSuccessResponse: true }), (req, res) => {
  const coordinationManager = req.app.locals.coordinationManager;
  const proposal = coordinationManager.getProposal(req.params.proposalId);
  if (!proposal) {
    return res.status(404).json({ success: false, error: 'Proposal not found' });
  }
  return res.json({ success: true, proposal });
});

router.post('/proposals', requireAgentKey({ allowAdmin: true, useSuccessResponse: true }), (req, res) => {
  const coordinationManager = req.app.locals.coordinationManager;
  const createdBy = req.agent?.id || req.body?.createdBy;
  try {
    const proposal = coordinationManager.createProposal({
      title: req.body?.title,
      description: req.body?.description,
      category: req.body?.category,
      objective: req.body?.objective,
      expiresAt: req.body?.expiresAt,
      requiredRoles: req.body?.requiredRoles,
      createdBy
    });
    return res.status(201).json({ success: true, proposal });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/proposals/:proposalId/join', requireAgentKey({ allowAdmin: true, useSuccessResponse: true }), (req, res) => {
  const coordinationManager = req.app.locals.coordinationManager;
  const agentId = req.agent?.id || req.body?.agentId;
  try {
    const result = coordinationManager.joinProposal(req.params.proposalId, agentId, req.body?.role);
    return res.json({ success: true, proposal: result.proposal, joined: result.joined });
  } catch (error) {
    return res.status(error.message === 'Proposal not found' ? 404 : 400).json({ success: false, error: error.message });
  }
});

router.post('/proposals/:proposalId/commit', requireAgentKey({ allowAdmin: true, useSuccessResponse: true }), (req, res) => {
  const coordinationManager = req.app.locals.coordinationManager;
  const agentId = req.agent?.id || req.body?.agentId;
  try {
    const commitment = coordinationManager.commitTask(req.params.proposalId, agentId, {
      task: req.body?.task,
      role: req.body?.role,
      dueAt: req.body?.dueAt
    });
    return res.status(201).json({ success: true, commitment });
  } catch (error) {
    return res.status(error.message === 'Proposal not found' ? 404 : 400).json({ success: false, error: error.message });
  }
});

router.patch('/proposals/:proposalId/commit/:commitmentId', requireAgentKey({ allowAdmin: true, useSuccessResponse: true }), (req, res) => {
  const coordinationManager = req.app.locals.coordinationManager;
  const by = req.agent?.id || req.body?.by;
  try {
    const commitment = coordinationManager.updateCommitment(req.params.proposalId, req.params.commitmentId, {
      status: req.body?.status,
      progress: req.body?.progress,
      notes: req.body?.notes,
      by
    });
    return res.json({ success: true, commitment });
  } catch (error) {
    const isMissing = error.message === 'Proposal not found' || error.message === 'Commitment not found';
    return res.status(isMissing ? 404 : 400).json({ success: false, error: error.message });
  }
});

router.patch('/proposals/:proposalId/status', requireAgentKey({ allowAdmin: true, useSuccessResponse: true }), (req, res) => {
  const coordinationManager = req.app.locals.coordinationManager;
  const by = req.agent?.id || req.body?.by;
  try {
    const proposal = coordinationManager.setProposalStatus(req.params.proposalId, req.body?.status, {
      by,
      summary: req.body?.summary
    });
    return res.json({ success: true, proposal });
  } catch (error) {
    return res.status(error.message === 'Proposal not found' ? 404 : 400).json({ success: false, error: error.message });
  }
});

export default router;

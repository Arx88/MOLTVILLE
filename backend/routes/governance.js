import express from 'express';
import { JoiHelpers, validateBody } from '../utils/validation.js';

const router = express.Router();
const { Joi } = JoiHelpers;

const candidateSchema = Joi.object({
  agentId: Joi.string().trim().required(),
  name: Joi.string().trim().required(),
  platform: Joi.string().allow('').default('')
});

const voteSchema = Joi.object({
  agentId: Joi.string().trim().required(),
  candidateId: Joi.string().trim().required()
});

const policySchema = Joi.object({
  type: Joi.string().trim().required(),
  value: Joi.number().required(),
  durationMs: Joi.number().positive().optional(),
  description: Joi.string().allow('').default('')
});

const noConfidenceStartSchema = Joi.object({
  agentId: Joi.string().trim().optional(),
  durationMs: Joi.number().positive().optional()
});

const noConfidenceVoteSchema = Joi.object({
  agentId: Joi.string().trim().required(),
  support: Joi.alternatives().try(Joi.boolean(), Joi.number().valid(0, 1), Joi.string().valid('true', 'false', '1', '0')).required()
});

router.get('/current', (req, res) => {
  const { governanceManager } = req.app.locals;
  res.json(governanceManager.getSummary());
});

router.post('/candidate', validateBody(candidateSchema), (req, res) => {
  const { agentId, name, platform } = req.body;
  const { governanceManager, reputationManager } = req.app.locals;
  try {
    const summary = governanceManager.registerCandidate(agentId, name, platform, reputationManager);
    res.json({ success: true, election: summary });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/vote', validateBody(voteSchema), (req, res) => {
  const { agentId, candidateId } = req.body;
  const { governanceManager } = req.app.locals;
  try {
    const summary = governanceManager.castVote(agentId, candidateId);
    res.json({ success: true, election: summary });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/policies', validateBody(policySchema), (req, res) => {
  const { type, value, durationMs, description } = req.body;
  const { governanceManager } = req.app.locals;
  try {
    const policy = governanceManager.setPolicy({
      type,
      value,
      durationMs: durationMs ? Number(durationMs) : null,
      description
    });
    res.json({ success: true, policy });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/no-confidence/start', validateBody(noConfidenceStartSchema), (req, res) => {
  const { governanceManager, moltbotRegistry } = req.app.locals;
  const activeAgents = moltbotRegistry?.getAgentCount?.() || 0;
  try {
    const vote = governanceManager.startNoConfidenceVote({
      initiatorId: req.body?.agentId || null,
      durationMs: req.body?.durationMs,
      totalActiveAgents: activeAgents
    });
    res.json({ success: true, noConfidence: vote });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/no-confidence/vote', validateBody(noConfidenceVoteSchema), (req, res) => {
  const { governanceManager } = req.app.locals;
  try {
    const summary = governanceManager.castNoConfidenceVote({
      agentId: req.body.agentId,
      support: req.body.support
    });
    res.json({ success: true, noConfidence: summary });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/no-confidence/resolve', (req, res) => {
  const { governanceManager, moltbotRegistry } = req.app.locals;
  const activeAgents = moltbotRegistry?.getAgentCount?.() || 0;
  try {
    const result = governanceManager.resolveNoConfidenceVote(activeAgents);
    if (!result) {
      return res.status(400).json({ success: false, error: 'No active no-confidence vote' });
    }
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

export default router;


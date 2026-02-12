import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAdminKey } from '../utils/adminAuth.js';
import { requireAgentKey } from '../utils/agentAuth.js';
import { JoiHelpers, validateBody } from '../utils/validation.js';
import { recordIntentSignal } from '../utils/metrics.js';

const router = express.Router();
const { Joi } = JoiHelpers;

const conversationStartSchema = Joi.object({
  targetId: Joi.string().trim().required(),
  message: Joi.string().allow('').optional().default('')
});

const conversationMessageSchema = Joi.object({
  message: Joi.string().trim().required()
});

const socialActionSchema = Joi.object({
  actionType: Joi.string().trim().required(),
  targetId: Joi.string().trim().required(),
  data: Joi.object().unknown(true).default({})
});

const permissionsSchema = Joi.object({
  agentId: Joi.string().trim().required(),
  permissions: Joi.array().items(Joi.string().trim()).required()
});

const buildActorMeta = (body = {}) => {
  const actorId = typeof body.actorId === 'string' ? body.actorId.trim() : '';
  const actorType = typeof body.actorType === 'string' ? body.actorType.trim() : '';
  return {
    actorId: actorId.length > 0 ? actorId : null,
    actorType: actorType.length > 0 ? actorType : null
  };
};

// Generate API key for new moltbot
router.post('/generate-key', requireAdminKey, async (req, res) => {
  try {
    const { moltbotName } = req.body;
    
    if (typeof moltbotName !== 'string' || moltbotName.trim().length === 0) {
      return res.status(400).json({ error: 'Moltbot name is required' });
    }

    const trimmedName = moltbotName.trim();
    const apiKey = `moltville_${uuidv4().replace(/-/g, '')}`;
    const { moltbotRegistry } = req.app.locals;
    await moltbotRegistry.issueApiKey(apiKey, {
      ...buildActorMeta(req.body),
      metadata: { moltbotName: trimmedName }
    });

    // In production, store this in database
    res.json({
      apiKey,
      moltbotName: trimmedName,
      createdAt: Date.now(),
      instructions: {
        websocket: `ws://localhost:${process.env.PORT || 3001}`,
        event: 'agent:connect',
        payload: {
          apiKey,
          agentId: uuidv4(),
          agentName: trimmedName,
          avatar: 'char1'
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Revoke API key
router.post('/revoke-key', requireAdminKey, async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return res.status(400).json({ error: 'API key is required' });
    }
    const normalizedKey = apiKey.trim();
    const { moltbotRegistry, io } = req.app.locals;

    if (!moltbotRegistry.isApiKeyIssued(normalizedKey)) {
      return res.status(404).json({ error: 'API key not found' });
    }

    const agent = moltbotRegistry.getAgentByApiKey(normalizedKey);
    if (agent) {
      const socketId = moltbotRegistry.getAgentSocket(agent.id);
      if (socketId && io) {
        io.to(socketId).disconnectSockets(true);
      }
      moltbotRegistry.unregisterAgent(agent.id);
    }

    const metadata = {};
    if (typeof req.body.reason === 'string' && req.body.reason.trim().length > 0) {
      metadata.reason = req.body.reason.trim();
    }
    moltbotRegistry.revokeApiKey(normalizedKey, {
      ...buildActorMeta(req.body),
      metadata: Object.keys(metadata).length ? metadata : null
    });

    return res.json({ revoked: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rotate API key
router.post('/rotate-key', requireAdminKey, async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return res.status(400).json({ error: 'API key is required' });
    }
    const normalizedKey = apiKey.trim();
    const { moltbotRegistry, io } = req.app.locals;

    if (!moltbotRegistry.isApiKeyIssued(normalizedKey)) {
      return res.status(404).json({ error: 'API key not found' });
    }

    const newApiKey = `moltville_${uuidv4().replace(/-/g, '')}`;
    const metadata = {};
    if (typeof req.body.reason === 'string' && req.body.reason.trim().length > 0) {
      metadata.reason = req.body.reason.trim();
    }
    const rotation = await moltbotRegistry.rotateApiKey(normalizedKey, newApiKey, {
      ...buildActorMeta(req.body),
      metadata: Object.keys(metadata).length ? metadata : null
    });

    if (rotation?.agentId) {
      const socketId = moltbotRegistry.getAgentSocket(rotation.agentId);
      if (socketId && io) {
        io.to(socketId).emit('auth:rotated', { apiKey: newApiKey });
      }
    }

    return res.json({
      rotated: true,
      apiKey: newApiKey,
      instructions: {
        websocket: `ws://localhost:${process.env.PORT || 3001}`,
        event: 'agent:connect',
        payload: {
          apiKey: newApiKey,
          agentId: rotation?.agentId || uuidv4()
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List API keys with status
router.get('/keys', requireAdminKey, async (req, res) => {
  try {
    const { moltbotRegistry } = req.app.locals;
    const keys = await moltbotRegistry.listApiKeys();
    res.json(keys);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List API key audit events
router.get('/keys/events', requireAdminKey, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const { moltbotRegistry } = req.app.locals;
    const events = await moltbotRegistry.listApiKeyEvents(limit);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set agent permissions
router.post('/permissions', requireAdminKey, validateBody(permissionsSchema), async (req, res) => {
  try {
    const { agentId, permissions } = req.body;
    const { moltbotRegistry } = req.app.locals;
    const normalized = moltbotRegistry.setAgentPermissions(agentId, permissions);
    res.json({ agentId, permissions: normalized });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get agent permissions
router.get('/:agentId/permissions', requireAdminKey, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { moltbotRegistry } = req.app.locals;
    const agent = moltbotRegistry.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json({ agentId, permissions: agent.permissions || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get agent info
router.get('/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { moltbotRegistry } = req.app.locals;
    
    const agent = moltbotRegistry.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      connectedAt: agent.connectedAt,
      lastSeen: agent.lastSeen,
      stats: agent.stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get agent memory
router.get('/:agentId/memory', requireAdminKey, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { type, limit } = req.query;
    const { moltbotRegistry } = req.app.locals;
    
    const memory = moltbotRegistry.getAgentMemory(
      agentId,
      type || null,
      parseInt(limit) || 10
    );
    
    if (!memory) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json(memory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Agent conversations
router.get('/:agentId/conversations', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.params.agentId
}), (req, res) => {
  const { agentId } = req.params;
  const { interactionEngine } = req.app.locals;
  res.json({ conversations: interactionEngine.getAgentConversations(agentId) });
});

router.post('/:agentId/conversations/start', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.params.agentId
}), async (req, res) => {
  const { agentId } = req.params;
  const targetId = typeof req.body?.targetId === 'string' ? req.body.targetId.trim() : '';
  const message = typeof req.body?.message === 'string' ? req.body.message : '';
  if (!targetId) {
    return res.status(400).json({ success: false, error: 'targetId is required' });
  }
  const { interactionEngine, moltbotRegistry, io } = req.app.locals;
  try {
    const conversation = await interactionEngine.initiateConversation(agentId, targetId, message);
    recordIntentSignal('conversation_start', { agentId });
    if (io) {
      conversation.participants.forEach(participantId => {
        const socketId = moltbotRegistry.getAgentSocket(participantId);
        if (socketId) {
          io.to(socketId).emit('conversation:started', conversation);
        }
      });
    }
    return res.json({ success: true, conversation });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/:agentId/conversations/:conversationId/message', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.params.agentId
}), validateBody(conversationMessageSchema), async (req, res) => {
  const { agentId, conversationId } = req.params;
  const { message } = req.body;
  const { interactionEngine, moltbotRegistry, io } = req.app.locals;
  try {
    const conversation = await interactionEngine.addMessageToConversation(conversationId, agentId, message);
    recordIntentSignal('conversation_message', { agentId });
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    if (io) {
      conversation.participants.forEach(participantId => {
        const socketId = moltbotRegistry.getAgentSocket(participantId);
        if (socketId) {
          io.to(socketId).emit('conversation:message', { conversationId, message: lastMessage });
        }
      });
    }
    return res.json({ success: true, conversationId, message: lastMessage });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/:agentId/conversations/:conversationId/end', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.params.agentId
}), async (req, res) => {
  const { conversationId } = req.params;
  const { interactionEngine, moltbotRegistry, io } = req.app.locals;
  try {
    const conversation = await interactionEngine.endConversation(conversationId);
    if (io) {
      conversation.participants.forEach(participantId => {
        const socketId = moltbotRegistry.getAgentSocket(participantId);
        if (socketId) {
          io.to(socketId).emit('conversation:ended', {
            conversationId,
            endedAt: conversation.endedAt
          });
        }
      });
    }
    return res.json({ success: true, conversationId, endedAt: conversation.endedAt });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

// Agent social actions
router.post('/:agentId/social', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.params.agentId
}), validateBody(socialActionSchema), async (req, res) => {
  const { agentId } = req.params;
  const { actionType, targetId, data } = req.body;
  const { interactionEngine } = req.app.locals;
  try {
    const result = await interactionEngine.performSocialAction(agentId, actionType, targetId, data);
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

// Get agent favorites
router.get('/:agentId/favorites', requireAgentKey({
  allowAdmin: true,
  useSuccessResponse: true,
  getAgentId: (req) => req.params.agentId
}), async (req, res) => {
  try {
    const { agentId } = req.params;
    const { moltbotRegistry, worldState } = req.app.locals;
    const agent = moltbotRegistry.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    const favorites = agent.memory.favorites || { personId: null, locationId: null };
    const favoritePerson = favorites.personId ? moltbotRegistry.getAgent(favorites.personId) : null;
    const favoriteLocation = favorites.locationId
      ? worldState.buildings.find(building => building.id === favorites.locationId)
      : null;

    return res.json({
      person: favoritePerson
        ? { id: favoritePerson.id, name: favoritePerson.name }
        : null,
      location: favoriteLocation
        ? { id: favoriteLocation.id, name: favoriteLocation.name, type: favoriteLocation.type }
        : null
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Get agent relationships
router.get('/:agentId/relationships', requireAdminKey, async (req, res) => {
  try {
    const { agentId } = req.params;
    const { moltbotRegistry } = req.app.locals;
    
    const agent = moltbotRegistry.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const relationships = Object.entries(agent.memory.relationships).map(([otherId, rel]) => {
      const other = moltbotRegistry.getAgent(otherId);
      const summary = moltbotRegistry.getRelationship(agentId, otherId);
      return {
        agentId: otherId,
        agentName: other ? other.name : 'Unknown',
        affinity: rel.affinity,
        trust: rel.trust,
        respect: rel.respect,
        conflict: rel.conflict,
        interactions: rel.interactions,
        lastInteraction: rel.lastInteraction,
        emotions: summary?.emotions || []
      };
    });

    res.json(relationships);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all agents
router.get('/', async (req, res) => {
  try {
    const { moltbotRegistry } = req.app.locals;
    const agents = moltbotRegistry.getAllAgents();
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

import express from 'express';
import { requireAgentKey } from '../utils/agentAuth.js';

const router = express.Router();

router.get('/', (req, res) => {
  const eventManager = req.app.locals.eventManager;
  res.json({ events: eventManager.getSummary() });
});

router.post('/', requireAgentKey({ allowAdmin: true, useSuccessResponse: true }), (req, res) => {
  const eventManager = req.app.locals.eventManager;
  const { id, name, type, startAt, endAt, location, description, goalScope } = req.body;
  const hostId = req.agent?.id || null;
  try {
    const event = eventManager.createEvent({
      id,
      name,
      type,
      startAt,
      endAt,
      location: { ...location, hostId },
      description,
      goalScope
    });
    res.status(201).json({ success: true, event });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/:eventId/join', requireAgentKey({ allowAdmin: true, useSuccessResponse: true }), (req, res) => {
  const eventManager = req.app.locals.eventManager;
  const { eventId } = req.params;
  const agentId = req.agent?.id;
  const event = eventManager.joinEvent(eventId, agentId);
  if (!event) {
    return res.status(404).json({ success: false, error: 'Event not found' });
  }
  return res.json({ success: true, event });
});

export default router;

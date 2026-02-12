import express from 'express';
import { requireAgentKey } from '../utils/agentAuth.js';

const router = express.Router();

router.get('/', (req, res) => {
  const eventManager = req.app.locals.eventManager;
  res.json({ events: eventManager.getSummary() });
});

router.post('/', requireAgentKey({ allowAdmin: true, useSuccessResponse: true }), (req, res) => {
  const eventManager = req.app.locals.eventManager;
  const worldState = req.app.locals.worldState;
  const { id, name, type, startAt, location, description, goalScope, capacity, entryPrice } = req.body;
  const hostId = req.agent?.id || null;
  try {
    const startTs = Number.isFinite(Number(startAt)) ? Number(startAt) : Date.now();
    const gameDayMs = Number(worldState?.dayLengthMs || process.env.DAY_LENGTH_MS || 7200000);
    const fixedEndAt = startTs + gameDayMs;
    const event = eventManager.createEvent({
      id,
      name,
      type,
      startAt: startTs,
      endAt: fixedEndAt,
      location: { ...location, hostId },
      description,
      goalScope,
      capacity,
      entryPrice
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
  const result = eventManager.joinEvent(eventId, agentId);
  if (result?.error) {
    const map = {
      event_not_found: 404,
      event_not_active: 400,
      event_full: 400,
      insufficient_funds: 400,
      invalid_join_payload: 400
    };
    return res.status(map[result.error] || 400).json({ success: false, error: result.error, event: result.event || null });
  }
  return res.json({ success: true, event: result.event });
});

export default router;

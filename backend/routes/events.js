import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  const eventManager = req.app.locals.eventManager;
  res.json({ events: eventManager.getSummary() });
});

router.post('/', (req, res) => {
  const eventManager = req.app.locals.eventManager;
  const { id, name, type, startAt, endAt, location, description, goalScope } = req.body;
  try {
    const event = eventManager.createEvent({
      id,
      name,
      type,
      startAt,
      endAt,
      location,
      description,
      goalScope
    });
    res.status(201).json({ success: true, event });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;

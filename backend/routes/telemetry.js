import express from 'express';
import { requireAdminKeyWithSuccess } from '../utils/adminAuth.js';
import { JoiHelpers, validateBody } from '../utils/validation.js';

const router = express.Router();
const { Joi } = JoiHelpers;

const telemetrySchema = Joi.object({
  event: Joi.string().trim().required(),
  payload: Joi.object().default({})
});

router.get('/', requireAdminKeyWithSuccess, (req, res) => {
  const service = req.app.locals.telemetryService;
  const limit = Number(req.query.limit || 50);
  res.json({ events: service.list(limit) });
});

router.post('/', requireAdminKeyWithSuccess, validateBody(telemetrySchema), (req, res) => {
  const service = req.app.locals.telemetryService;
  const entry = service.track(req.body.event, req.body.payload);
  res.json({ success: true, entry });
});

export default router;

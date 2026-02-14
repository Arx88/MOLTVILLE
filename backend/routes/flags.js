import express from 'express';
import { requireAdminKeyWithSuccess } from '../utils/adminAuth.js';
import { JoiHelpers, validateBody } from '../utils/validation.js';

const router = express.Router();
const { Joi } = JoiHelpers;

const setFlagSchema = Joi.object({
  scope: Joi.string().valid('core', 'legacy').default('core'),
  flag: Joi.string().trim().min(1).required(),
  enabled: Joi.boolean().required(),
  reason: Joi.string().allow('').default('')
});

router.get('/', requireAdminKeyWithSuccess, (req, res) => {
  const coreFlags = req.app.locals.coreFlags;
  const legacyFlags = req.app.locals.featureFlags || {};

  res.json({
    success: true,
    flags: {
      core: typeof coreFlags?.list === 'function' ? coreFlags.list() : {},
      legacy: { ...legacyFlags }
    }
  });
});

router.post('/set', requireAdminKeyWithSuccess, validateBody(setFlagSchema), (req, res) => {
  const { scope, flag, enabled, reason } = req.body;
  const legacyFlags = req.app.locals.featureFlags || {};
  const coreFlags = req.app.locals.coreFlags;

  let value = Boolean(enabled);
  if (scope === 'core') {
    if (!coreFlags || typeof coreFlags.set !== 'function') {
      return res.status(500).json({ success: false, error: 'Core flags manager unavailable' });
    }
    value = coreFlags.set(flag, value, { source: 'api', reason });
  } else {
    legacyFlags[flag] = value;
  }

  return res.json({
    success: true,
    updated: {
      scope,
      flag,
      enabled: value,
      reason: reason || null
    },
    flags: {
      core: typeof coreFlags?.list === 'function' ? coreFlags.list() : {},
      legacy: { ...legacyFlags }
    }
  });
});

export default router;

import { config } from './config.js';

export const requireAdminKey = (req, res, next) => {
  if (!config.adminApiKey) {
    return next();
  }
  const provided = req.header('x-admin-key');
  if (!provided || provided !== config.adminApiKey) {
    return res.status(403).json({ error: 'Admin key required' });
  }
  return next();
};

export const requireAdminKeyWithSuccess = (req, res, next) => {
  if (!config.adminApiKey) {
    return next();
  }
  const provided = req.header('x-admin-key');
  if (!provided || provided !== config.adminApiKey) {
    return res.status(403).json({ success: false, error: 'Admin key required' });
  }
  return next();
};

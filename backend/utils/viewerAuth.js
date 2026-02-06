import { config } from './config.js';

const normalizeKey = (value) => (typeof value === 'string' ? value.trim() : '');

const getViewerKeyFromRequest = (req) => {
  const headerKey = normalizeKey(req.header('x-viewer-key'));
  if (headerKey) return headerKey;
  const queryKey = normalizeKey(req.query.viewerKey);
  if (queryKey) return queryKey;
  return '';
};

const getAdminKeyFromRequest = (req) => normalizeKey(req.header('x-admin-key'));

export const requireViewerKey = (req, res, next) => {
  if (!config.viewerApiKey) {
    return next();
  }
  const providedAdmin = getAdminKeyFromRequest(req);
  if (config.adminApiKey && providedAdmin === config.adminApiKey) {
    req.isAdmin = true;
    return next();
  }
  const viewerKey = getViewerKeyFromRequest(req);
  if (!viewerKey || viewerKey !== config.viewerApiKey) {
    return res.status(403).json({ error: 'Viewer key required' });
  }
  return next();
};

import { config } from './config.js';

const normalizeKey = (value) => (typeof value === 'string' ? value.trim() : '');

const getApiKeyFromRequest = (req) => {
  const headerKey = normalizeKey(req.header('x-api-key'));
  if (headerKey) return headerKey;
  const authHeader = normalizeKey(req.header('authorization'));
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return normalizeKey(authHeader.slice(7));
  }
  return '';
};

const getAdminKeyFromRequest = (req) => normalizeKey(req.header('x-admin-key'));

export const requireAgentKey = (options = {}) => (req, res, next) => {
  const {
    allowAdmin = true,
    useSuccessResponse = false,
    getAgentId = null
  } = options;

  if (allowAdmin && config.adminApiKey) {
    const providedAdmin = getAdminKeyFromRequest(req);
    if (providedAdmin && providedAdmin === config.adminApiKey) {
      req.isAdmin = true;
      return next();
    }
  }

  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey) {
    return res.status(401).json(useSuccessResponse
      ? { success: false, error: 'API key required' }
      : { error: 'API key required' });
  }

  const { moltbotRegistry } = req.app.locals;
  if (!moltbotRegistry?.isApiKeyIssued(apiKey)) {
    return res.status(401).json(useSuccessResponse
      ? { success: false, error: 'Invalid API key' }
      : { error: 'Invalid API key' });
  }

  req.agentApiKey = apiKey;
  const agent = moltbotRegistry.getAgentByApiKey(apiKey);
  if (agent) {
    req.agent = agent;
  }

  if (typeof getAgentId === 'function') {
    const requestedId = getAgentId(req);
    if (agent && requestedId && agent.id !== requestedId) {
      return res.status(403).json(useSuccessResponse
        ? { success: false, error: 'agentId does not match API key' }
        : { error: 'agentId does not match API key' });
    }
  }

  return next();
};

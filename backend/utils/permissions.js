const PERMISSION_SET = new Set([
  'move',
  'speak',
  'converse',
  'social',
  'action',
  'perceive'
]);

export const DEFAULT_AGENT_PERMISSIONS = Array.from(PERMISSION_SET);

export const normalizePermissions = (permissions) => {
  if (!Array.isArray(permissions)) {
    return [...DEFAULT_AGENT_PERMISSIONS];
  }
  const normalized = permissions
    .filter(value => typeof value === 'string')
    .map(value => value.trim())
    .filter(value => PERMISSION_SET.has(value));
  return normalized.length ? normalized : [...DEFAULT_AGENT_PERMISSIONS];
};

export const hasPermission = (permissions, permission) => {
  if (!Array.isArray(permissions)) return false;
  return permissions.includes(permission);
};

export const listPermissions = () => Array.from(PERMISSION_SET);

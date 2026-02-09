import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

const CONFIG_DIR = path.resolve(process.cwd(), 'config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'admin-config.json');
const ENV_PATH = path.resolve(process.cwd(), '.env');

const ALLOWED_KEYS = [
  'PORT',
  'FRONTEND_URL',
  'API_RATE_WINDOW_MS',
  'API_RATE_LIMIT',
  'SOCKET_RATE_LIMIT_MS',
  'SOCKET_SPEAK_LIMIT_MS',
  'SOCKET_PERCEIVE_LIMIT_MS',
  'SOCKET_RATE_MAX_STRIKES',
  'SOCKET_RATE_BLOCK_MS',
  'WORLD_TICK_RATE',
  'AGENT_DISCONNECT_GRACE_MS',
  'ADMIN_API_KEY',
  'VIEWER_API_KEY',
  'DATABASE_URL',
  'DB_SSL',
  'WORLD_SNAPSHOT_PATH',
  'WORLD_SNAPSHOT_SOURCE',
  'WORLD_SNAPSHOT_INTERVAL_MS',
  'WORLD_SNAPSHOT_ON_START',
  'WORLD_SNAPSHOT_ARCHIVE_DIR',
  'WORLD_SNAPSHOT_ARCHIVE_RETENTION',
  'WORLD_SNAPSHOT_ARCHIVE_CHECKSUM',
  'DAY_LENGTH_MS',
  'WEATHER_CHANGE_MS',
  'MEMORY_INTERACTIONS_MAX',
  'MEMORY_LOCATIONS_MAX',
  'MEMORY_MAX_AGE_MS',
  'MEMORY_PRUNE_INTERVAL_MS',
  'BUILDING_VOTE_DURATION_MS',
  'BUILDING_VOTE_OPTIONS',
  'BUILDING_VOTE_PROPOSALS',
  'BUILDING_PROPOSAL_TTL_MS',
  'BASE_INCOME',
  'INCOME_INTERVAL_MS',
  'REVIEW_THRESHOLD',
  'STARTING_BALANCE',
  'SHOW_MODE_MIN_SCENE_MS',
  'SHOW_MODE_DECAY_WINDOW_MS',
  'SHOW_MODE_SWITCH_THRESHOLD',
  'SHOW_MODE_QUEUE_LIMIT',
  'SHOW_MODE_THREADS_LIMIT',
  'SHOW_MODE_PREDICTIONS_ENABLED',
  'SHOW_MODE_ARCS_ENABLED',
  'SHOW_MODE_STATS_ENABLED',
  'SHOW_MODE_HEATMAP_ENABLED',
  'SHOW_MODE_REL_AFFINITY_DELTA',
  'SHOW_MODE_REL_CONFLICT_DELTA',
  'SHOW_MODE_SCORE_AFFINITY',
  'SHOW_MODE_SCORE_CONFLICT',
  'SHOW_MODE_AFFINITY_MULTIPLIER',
  'SHOW_MODE_CONFLICT_MULTIPLIER',
  'SHOW_MODE_CLIMAX_MULTIPLIER',
  'SHOW_MODE_NOVELTY_BONUS',
  'SHOW_MODE_WITNESS_RADIUS',
  'SHOW_MODE_WITNESS_SCORE_PER',
  'SHOW_MODE_WITNESS_SCORE_MAX',
  'SHOW_MODE_KEYWORD_MULTIPLIER',
  'SHOW_MODE_POLITICA_BONUS',
  'SHOW_MODE_NEGOCIO_BONUS',
  'SHOW_MODE_PREDICTIONS_LIMIT',
  'SHOW_MODE_HEATMAP_RETENTION_MIN',
  'NPC_MIN_REAL_AGENTS',
  'NPC_MAX_COUNT',
  'NPC_MAX_RATIO',
  'NPC_BEHAVIOR_INTERVAL_MS',
  'NPC_DESPAWN_GRACE_MS',
  'NPC_SPAWN_CHECK_MS',
  'HEALTH_CHECK_INTERVAL_MS',
  'HEALTH_LOW_POPULATION',
  'HEALTH_TICK_LATENCY_MS',
  'HEALTH_CIRCUIT_WINDOW_MS',
  'HEALTH_CIRCUIT_FAILURES',
  'EVENT_SCHEDULE_INTERVAL_MS',
  'EVENT_RANDOM_CHANCE',
  'KICK_CHAT_URL',
  'KICK_CHANNEL',
  'KICK_MODS',
  'KICK_COMMAND_PREFIX',
  'KICK_RECONNECT_MS',
  'KICK_RTMP_URL',
  'KICK_STREAM_KEY',
  'STREAM_FRONTEND_URL',
  'STREAM_FPS',
  'STREAM_RESOLUTION',
  'STREAM_BITRATE',
  'ANALYTICS_RECORD_INTERVAL_MS'
];

const sanitizeConfig = (config = {}) => {
  const sanitized = {};
  ALLOWED_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      sanitized[key] = config[key];
    }
  });
  return sanitized;
};

export const loadConfigOverrides = () => {
  try {
    const raw = fsSync.readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return sanitizeConfig(parsed);
  } catch (error) {
    return {};
  }
};

const parseEnvFile = (content) => {
  const lines = content.split('\n');
  const entries = new Map();
  lines.forEach((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) return;
    const [, key, value] = match;
    entries.set(key, value);
  });
  return entries;
};

const formatEnvValue = (value) => {
  if (value === null || typeof value === 'undefined') return '';
  const stringValue = String(value);
  if (stringValue.includes(' ') || stringValue.includes('#')) {
    return `"${stringValue.replace(/"/g, '\\"')}"`;
  }
  return stringValue;
};

export const saveConfigOverrides = async (config = {}) => {
  const sanitized = sanitizeConfig(config);
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(sanitized, null, 2));

  let envContent = '';
  try {
    envContent = await fs.readFile(ENV_PATH, 'utf-8');
  } catch (error) {
    envContent = '';
  }

  const envEntries = parseEnvFile(envContent);
  Object.entries(sanitized).forEach(([key, value]) => {
    envEntries.set(key, formatEnvValue(value));
  });

  const newEnv = Array.from(envEntries.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  await fs.writeFile(ENV_PATH, newEnv);
  return sanitized;
};

export const allowedConfigKeys = () => [...ALLOWED_KEYS];

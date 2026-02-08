import dotenv from 'dotenv';
import Joi from 'joi';
import { loadConfigOverrides } from './configStore.js';

dotenv.config();

const schema = Joi.object({
  PORT: Joi.number().integer().min(1).max(65535).default(3001),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),
  API_RATE_WINDOW_MS: Joi.number().integer().min(1000).default(60000),
  API_RATE_LIMIT: Joi.number().integer().min(1).default(100),
  SOCKET_RATE_LIMIT_MS: Joi.number().integer().min(50).default(200),
  SOCKET_SPEAK_LIMIT_MS: Joi.number().integer().min(50).default(800),
  SOCKET_PERCEIVE_LIMIT_MS: Joi.number().integer().min(50).default(250),
  SOCKET_RATE_MAX_STRIKES: Joi.number().integer().min(1).default(5),
  SOCKET_RATE_BLOCK_MS: Joi.number().integer().min(1000).default(30000),
  WORLD_TICK_RATE: Joi.number().integer().min(20).default(100),
  BUILDING_VOTE_DURATION_MS: Joi.number().integer().min(60000).optional(),
  BUILDING_VOTE_OPTIONS: Joi.number().integer().min(1).optional(),
  BUILDING_VOTE_PROPOSALS: Joi.number().integer().min(0).optional(),
  BUILDING_PROPOSAL_TTL_MS: Joi.number().integer().min(60000).optional(),
  AGENT_DISCONNECT_GRACE_MS: Joi.number().integer().min(1000).default(15000),
  ADMIN_API_KEY: Joi.string().optional().allow('', null),
  DATABASE_URL: Joi.string().uri().optional().allow('', null),
  DB_SSL: Joi.string().valid('true', 'false').default('false'),
  VIEWER_API_KEY: Joi.string().optional().allow('', null),
  WORLD_SNAPSHOT_PATH: Joi.string().default('world_snapshot.json'),
  WORLD_SNAPSHOT_SOURCE: Joi.string().valid('file', 'db').default('file'),
  WORLD_SNAPSHOT_INTERVAL_MS: Joi.number().integer().min(0).optional(),
  WORLD_SNAPSHOT_ON_START: Joi.string().valid('true', 'false').default('false'),
  WORLD_SNAPSHOT_ARCHIVE_DIR: Joi.string().optional().allow('', null),
  WORLD_SNAPSHOT_ARCHIVE_RETENTION: Joi.number().integer().min(1).optional(),
  WORLD_SNAPSHOT_ARCHIVE_CHECKSUM: Joi.string().valid('true', 'false').default('true'),
  SHOW_MODE_MIN_SCENE_MS: Joi.number().integer().min(1000).default(10000),
  SHOW_MODE_DECAY_WINDOW_MS: Joi.number().integer().min(1000).default(30000),
  SHOW_MODE_SWITCH_THRESHOLD: Joi.number().integer().min(0).default(15),
  SHOW_MODE_QUEUE_LIMIT: Joi.number().integer().min(1).default(3),
  SHOW_MODE_THREADS_LIMIT: Joi.number().integer().min(1).default(6),
  SHOW_MODE_PREDICTIONS_ENABLED: Joi.string().valid('true', 'false').default('true'),
  SHOW_MODE_ARCS_ENABLED: Joi.string().valid('true', 'false').default('true'),
  SHOW_MODE_STATS_ENABLED: Joi.string().valid('true', 'false').default('true'),
  SHOW_MODE_HEATMAP_ENABLED: Joi.string().valid('true', 'false').default('true'),
  SHOW_MODE_REL_AFFINITY_DELTA: Joi.number().min(0).default(10),
  SHOW_MODE_REL_CONFLICT_DELTA: Joi.number().min(0).default(8),
  SHOW_MODE_SCORE_AFFINITY: Joi.number().min(0).default(18),
  SHOW_MODE_SCORE_CONFLICT: Joi.number().min(0).default(22),
  SHOW_MODE_AFFINITY_MULTIPLIER: Joi.number().min(1).default(1.4),
  SHOW_MODE_CONFLICT_MULTIPLIER: Joi.number().min(1).default(1.5),
  SHOW_MODE_CLIMAX_MULTIPLIER: Joi.number().min(1).default(1.8),
  SHOW_MODE_NOVELTY_BONUS: Joi.number().min(0).default(12),
  SHOW_MODE_WITNESS_RADIUS: Joi.number().min(0).default(6),
  SHOW_MODE_WITNESS_SCORE_PER: Joi.number().min(0).default(3),
  SHOW_MODE_WITNESS_SCORE_MAX: Joi.number().min(0).default(20),
  SHOW_MODE_KEYWORD_MULTIPLIER: Joi.number().min(1).default(1.3),
  SHOW_MODE_POLITICA_BONUS: Joi.number().min(0).default(18),
  SHOW_MODE_NEGOCIO_BONUS: Joi.number().min(0).default(10),
  SHOW_MODE_PREDICTIONS_LIMIT: Joi.number().integer().min(1).default(4),
  SHOW_MODE_HEATMAP_RETENTION_MIN: Joi.number().min(1).default(5)
}).unknown(true);

const applyOverrides = () => {
  const overrides = loadConfigOverrides();
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === null || typeof value === 'undefined') return;
    process.env[key] = String(value);
  });
};

const buildConfig = () => {
  applyOverrides();
  const { value, error } = schema.validate(process.env, {
    abortEarly: false,
    convert: true
  });

  if (error) {
    const details = error.details.map(detail => detail.message).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return {
    port: value.PORT,
    frontendUrl: value.FRONTEND_URL,
    apiRateWindowMs: value.API_RATE_WINDOW_MS,
    apiRateLimit: value.API_RATE_LIMIT,
    socketRateLimitMs: value.SOCKET_RATE_LIMIT_MS,
    socketSpeakLimitMs: value.SOCKET_SPEAK_LIMIT_MS,
    socketPerceiveLimitMs: value.SOCKET_PERCEIVE_LIMIT_MS,
    socketRateMaxStrikes: value.SOCKET_RATE_MAX_STRIKES,
    socketRateBlockMs: value.SOCKET_RATE_BLOCK_MS,
    worldTickRate: value.WORLD_TICK_RATE,
    agentDisconnectGraceMs: value.AGENT_DISCONNECT_GRACE_MS,
    adminApiKey: value.ADMIN_API_KEY,
    viewerApiKey: value.VIEWER_API_KEY,
    worldSnapshotPath: value.WORLD_SNAPSHOT_PATH,
    worldSnapshotSource: value.WORLD_SNAPSHOT_SOURCE,
    worldSnapshotIntervalMs: (() => {
      if (value.WORLD_SNAPSHOT_INTERVAL_MS === 0) return null;
      if (typeof value.WORLD_SNAPSHOT_INTERVAL_MS === 'number') return value.WORLD_SNAPSHOT_INTERVAL_MS;
      return value.WORLD_SNAPSHOT_SOURCE === 'db' ? 60000 : 300000;
    })(),
    worldSnapshotOnStart: value.WORLD_SNAPSHOT_ON_START
      ? value.WORLD_SNAPSHOT_ON_START === 'true'
      : value.WORLD_SNAPSHOT_SOURCE === 'db',
    worldSnapshotArchiveDir: value.WORLD_SNAPSHOT_ARCHIVE_DIR || null,
    worldSnapshotArchiveRetention: value.WORLD_SNAPSHOT_ARCHIVE_RETENTION,
    worldSnapshotArchiveChecksum: value.WORLD_SNAPSHOT_ARCHIVE_CHECKSUM === 'true',
    showMode: {
      minSceneDurationMs: value.SHOW_MODE_MIN_SCENE_MS,
      decayWindowMs: value.SHOW_MODE_DECAY_WINDOW_MS,
      switchThreshold: value.SHOW_MODE_SWITCH_THRESHOLD,
      queueLimit: value.SHOW_MODE_QUEUE_LIMIT,
      threadsLimit: value.SHOW_MODE_THREADS_LIMIT,
      predictionsEnabled: value.SHOW_MODE_PREDICTIONS_ENABLED === 'true',
      arcsEnabled: value.SHOW_MODE_ARCS_ENABLED === 'true',
      statsEnabled: value.SHOW_MODE_STATS_ENABLED === 'true',
      heatmapEnabled: value.SHOW_MODE_HEATMAP_ENABLED === 'true',
      relationshipAffinityDelta: value.SHOW_MODE_REL_AFFINITY_DELTA,
      relationshipConflictDelta: value.SHOW_MODE_REL_CONFLICT_DELTA,
      relationshipAffinityScore: value.SHOW_MODE_SCORE_AFFINITY,
      relationshipConflictScore: value.SHOW_MODE_SCORE_CONFLICT,
      affinityMultiplier: value.SHOW_MODE_AFFINITY_MULTIPLIER,
      conflictMultiplier: value.SHOW_MODE_CONFLICT_MULTIPLIER,
      climaxMultiplier: value.SHOW_MODE_CLIMAX_MULTIPLIER,
      noveltyBonus: value.SHOW_MODE_NOVELTY_BONUS,
      witnessRadius: value.SHOW_MODE_WITNESS_RADIUS,
      witnessScorePer: value.SHOW_MODE_WITNESS_SCORE_PER,
      witnessScoreMax: value.SHOW_MODE_WITNESS_SCORE_MAX,
      keywordMultiplier: value.SHOW_MODE_KEYWORD_MULTIPLIER,
      politicaBonus: value.SHOW_MODE_POLITICA_BONUS,
      negocioBonus: value.SHOW_MODE_NEGOCIO_BONUS,
      predictionsLimit: value.SHOW_MODE_PREDICTIONS_LIMIT,
      heatmapRetentionMinutes: value.SHOW_MODE_HEATMAP_RETENTION_MIN
    }
  };
};

export let config = buildConfig();

export const refreshConfig = () => {
  config = buildConfig();
  return config;
};

export const configSchema = schema;

import express from 'express';
import Joi from 'joi';
import { requireAdminKey } from '../utils/adminAuth.js';
import { allowedConfigKeys, loadConfigOverrides, saveConfigOverrides } from '../utils/configStore.js';
import { config, refreshConfig } from '../utils/config.js';

const router = express.Router();

const CONFIG_SCHEMA = Joi.object({
  PORT: Joi.number().integer().min(1).max(65535),
  FRONTEND_URL: Joi.string().uri(),
  API_RATE_WINDOW_MS: Joi.number().integer().min(1000),
  API_RATE_LIMIT: Joi.number().integer().min(1),
  SOCKET_RATE_LIMIT_MS: Joi.number().integer().min(50),
  SOCKET_SPEAK_LIMIT_MS: Joi.number().integer().min(50),
  SOCKET_PERCEIVE_LIMIT_MS: Joi.number().integer().min(50),
  SOCKET_RATE_MAX_STRIKES: Joi.number().integer().min(1),
  SOCKET_RATE_BLOCK_MS: Joi.number().integer().min(1000),
  WORLD_TICK_RATE: Joi.number().integer().min(20),
  AGENT_DISCONNECT_GRACE_MS: Joi.number().integer().min(1000),
  ADMIN_API_KEY: Joi.string().allow('', null),
  VIEWER_API_KEY: Joi.string().allow('', null),
  DATABASE_URL: Joi.string().allow('', null),
  DB_SSL: Joi.string().valid('true', 'false'),
  WORLD_SNAPSHOT_PATH: Joi.string(),
  WORLD_SNAPSHOT_SOURCE: Joi.string().valid('file', 'db'),
  WORLD_SNAPSHOT_INTERVAL_MS: Joi.number().integer().min(0),
  WORLD_SNAPSHOT_ON_START: Joi.string().valid('true', 'false'),
  WORLD_SNAPSHOT_ARCHIVE_DIR: Joi.string().allow('', null),
  WORLD_SNAPSHOT_ARCHIVE_RETENTION: Joi.number().integer().min(1),
  WORLD_SNAPSHOT_ARCHIVE_CHECKSUM: Joi.string().valid('true', 'false'),
  DAY_LENGTH_MS: Joi.number().integer().min(60000),
  WEATHER_CHANGE_MS: Joi.number().integer().min(60000),
  MEMORY_INTERACTIONS_MAX: Joi.number().integer().min(1),
  MEMORY_LOCATIONS_MAX: Joi.number().integer().min(1),
  MEMORY_MAX_AGE_MS: Joi.number().integer().min(60000),
  MEMORY_PRUNE_INTERVAL_MS: Joi.number().integer().min(60000),
  BUILDING_VOTE_DURATION_MS: Joi.number().integer().min(60000),
  BUILDING_VOTE_OPTIONS: Joi.number().integer().min(1),
  BUILDING_VOTE_PROPOSALS: Joi.number().integer().min(0),
  BUILDING_PROPOSAL_TTL_MS: Joi.number().integer().min(60000),
  BASE_INCOME: Joi.number().integer().min(0),
  INCOME_INTERVAL_MS: Joi.number().integer().min(1000),
  REVIEW_THRESHOLD: Joi.number().min(0),
  STARTING_BALANCE: Joi.number().min(0)
}).unknown(false);

const buildConfigResponse = () => ({
  current: {
    PORT: config.port,
    FRONTEND_URL: config.frontendUrl,
    API_RATE_WINDOW_MS: config.apiRateWindowMs,
    API_RATE_LIMIT: config.apiRateLimit,
    SOCKET_RATE_LIMIT_MS: config.socketRateLimitMs,
    SOCKET_SPEAK_LIMIT_MS: config.socketSpeakLimitMs,
    SOCKET_PERCEIVE_LIMIT_MS: config.socketPerceiveLimitMs,
    SOCKET_RATE_MAX_STRIKES: config.socketRateMaxStrikes,
    SOCKET_RATE_BLOCK_MS: config.socketRateBlockMs,
    WORLD_TICK_RATE: config.worldTickRate,
    AGENT_DISCONNECT_GRACE_MS: config.agentDisconnectGraceMs,
    ADMIN_API_KEY: config.adminApiKey || '',
    VIEWER_API_KEY: config.viewerApiKey || '',
    WORLD_SNAPSHOT_PATH: config.worldSnapshotPath,
    WORLD_SNAPSHOT_SOURCE: config.worldSnapshotSource,
    WORLD_SNAPSHOT_INTERVAL_MS: config.worldSnapshotIntervalMs ?? 0,
    WORLD_SNAPSHOT_ON_START: config.worldSnapshotOnStart ? 'true' : 'false',
    WORLD_SNAPSHOT_ARCHIVE_DIR: config.worldSnapshotArchiveDir || '',
    WORLD_SNAPSHOT_ARCHIVE_RETENTION: config.worldSnapshotArchiveRetention || '',
    WORLD_SNAPSHOT_ARCHIVE_CHECKSUM: config.worldSnapshotArchiveChecksum ? 'true' : 'false',
    DAY_LENGTH_MS: process.env.DAY_LENGTH_MS || '7200000',
    WEATHER_CHANGE_MS: process.env.WEATHER_CHANGE_MS || '3600000',
    MEMORY_INTERACTIONS_MAX: process.env.MEMORY_INTERACTIONS_MAX || '200',
    MEMORY_LOCATIONS_MAX: process.env.MEMORY_LOCATIONS_MAX || '100',
    MEMORY_MAX_AGE_MS: process.env.MEMORY_MAX_AGE_MS || '604800000',
    MEMORY_PRUNE_INTERVAL_MS: process.env.MEMORY_PRUNE_INTERVAL_MS || '600000',
    BUILDING_VOTE_DURATION_MS: process.env.BUILDING_VOTE_DURATION_MS || '86400000',
    BUILDING_VOTE_OPTIONS: process.env.BUILDING_VOTE_OPTIONS || '4',
    BUILDING_VOTE_PROPOSALS: process.env.BUILDING_VOTE_PROPOSALS || '1',
    BUILDING_PROPOSAL_TTL_MS: process.env.BUILDING_PROPOSAL_TTL_MS || '604800000',
    BASE_INCOME: process.env.BASE_INCOME || '2',
    INCOME_INTERVAL_MS: process.env.INCOME_INTERVAL_MS || '60000',
    REVIEW_THRESHOLD: process.env.REVIEW_THRESHOLD || '2.5',
    STARTING_BALANCE: process.env.STARTING_BALANCE || '10',
    DATABASE_URL: process.env.DATABASE_URL || '',
    DB_SSL: process.env.DB_SSL || 'false'
  },
  overrides: loadConfigOverrides(),
  allowedKeys: allowedConfigKeys()
});

router.get('/config', requireAdminKey, (req, res) => {
  res.json(buildConfigResponse());
});

router.put('/config', requireAdminKey, async (req, res, next) => {
  try {
    const payload = req.body?.config || req.body || {};
    const { value, error } = CONFIG_SCHEMA.validate(payload, { abortEarly: false, convert: true });
    if (error) {
      return res.status(400).json({
        error: 'Invalid configuration',
        details: error.details.map((detail) => detail.message)
      });
    }
    const saved = await saveConfigOverrides(value);
    refreshConfig();
    return res.json({
      success: true,
      saved,
      current: buildConfigResponse().current,
      restartRequired: true
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/restart', requireAdminKey, (req, res) => {
  res.json({ success: true, message: 'Restarting server...' });
  setTimeout(() => process.exit(0), 500);
});

export default router;

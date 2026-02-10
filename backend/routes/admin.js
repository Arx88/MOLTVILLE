import express from 'express';
import Joi from 'joi';
import { requireAdminKey } from '../utils/adminAuth.js';
import { allowedConfigKeys, loadConfigOverrides, saveConfigOverrides } from '../utils/configStore.js';
import { config, refreshConfig } from '../utils/config.js';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { loadMiniMaxToken, getMiniMaxAuthPath } from '../utils/minimaxAuth.js';
import { requestDeviceCode, openVerificationUrl, pollForToken, getAuthStatus, loadToken } from '../utils/qwenAuth.js';

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
  STARTING_BALANCE: Joi.number().min(0),
  SHOW_MODE_MIN_SCENE_MS: Joi.number().integer().min(1000),
  SHOW_MODE_DECAY_WINDOW_MS: Joi.number().integer().min(1000),
  SHOW_MODE_SWITCH_THRESHOLD: Joi.number().integer().min(0),
  SHOW_MODE_QUEUE_LIMIT: Joi.number().integer().min(1),
  SHOW_MODE_THREADS_LIMIT: Joi.number().integer().min(1),
  SHOW_MODE_PREDICTIONS_ENABLED: Joi.string().valid('true', 'false'),
  SHOW_MODE_ARCS_ENABLED: Joi.string().valid('true', 'false'),
  SHOW_MODE_STATS_ENABLED: Joi.string().valid('true', 'false'),
  SHOW_MODE_HEATMAP_ENABLED: Joi.string().valid('true', 'false'),
  SHOW_MODE_REL_AFFINITY_DELTA: Joi.number().min(0),
  SHOW_MODE_REL_CONFLICT_DELTA: Joi.number().min(0),
  SHOW_MODE_SCORE_AFFINITY: Joi.number().min(0),
  SHOW_MODE_SCORE_CONFLICT: Joi.number().min(0),
  SHOW_MODE_AFFINITY_MULTIPLIER: Joi.number().min(1),
  SHOW_MODE_CONFLICT_MULTIPLIER: Joi.number().min(1),
  SHOW_MODE_CLIMAX_MULTIPLIER: Joi.number().min(1),
  SHOW_MODE_NOVELTY_BONUS: Joi.number().min(0),
  SHOW_MODE_WITNESS_RADIUS: Joi.number().min(0),
  SHOW_MODE_WITNESS_SCORE_PER: Joi.number().min(0),
  SHOW_MODE_WITNESS_SCORE_MAX: Joi.number().min(0),
  SHOW_MODE_KEYWORD_MULTIPLIER: Joi.number().min(1),
  SHOW_MODE_POLITICA_BONUS: Joi.number().min(0),
  SHOW_MODE_NEGOCIO_BONUS: Joi.number().min(0),
  SHOW_MODE_PREDICTIONS_LIMIT: Joi.number().integer().min(1),
  SHOW_MODE_HEATMAP_RETENTION_MIN: Joi.number().min(1),
  NPC_MIN_REAL_AGENTS: Joi.number().integer().min(0),
  NPC_MAX_COUNT: Joi.number().integer().min(0),
  NPC_MAX_RATIO: Joi.number().min(0).max(1),
  NPC_BEHAVIOR_INTERVAL_MS: Joi.number().integer().min(1000),
  NPC_DESPAWN_GRACE_MS: Joi.number().integer().min(1000),
  NPC_SPAWN_CHECK_MS: Joi.number().integer().min(1000),
  HEALTH_CHECK_INTERVAL_MS: Joi.number().integer().min(1000),
  HEALTH_LOW_POPULATION: Joi.number().integer().min(0),
  HEALTH_TICK_LATENCY_MS: Joi.number().integer().min(0),
  HEALTH_CIRCUIT_WINDOW_MS: Joi.number().integer().min(1000),
  HEALTH_CIRCUIT_FAILURES: Joi.number().integer().min(1),
  EVENT_SCHEDULE_INTERVAL_MS: Joi.number().integer().min(1000),
  EVENT_RANDOM_CHANCE: Joi.number().min(0).max(1),
  KICK_CHAT_URL: Joi.string().allow('', null),
  KICK_CHANNEL: Joi.string().allow('', null),
  KICK_MODS: Joi.string().allow('', null),
  KICK_COMMAND_PREFIX: Joi.string().allow('', null),
  KICK_RECONNECT_MS: Joi.number().integer().min(1000),
  KICK_RTMP_URL: Joi.string().allow('', null),
  KICK_STREAM_KEY: Joi.string().allow('', null),
  STREAM_FRONTEND_URL: Joi.string().allow('', null),
  STREAM_FPS: Joi.number().integer().min(1),
  STREAM_RESOLUTION: Joi.string().allow('', null),
  STREAM_BITRATE: Joi.string().allow('', null),
  ANALYTICS_RECORD_INTERVAL_MS: Joi.number().integer().min(1000)
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
    DB_SSL: process.env.DB_SSL || 'false',
    SHOW_MODE_MIN_SCENE_MS: config.showMode?.minSceneDurationMs ?? 10000,
    SHOW_MODE_DECAY_WINDOW_MS: config.showMode?.decayWindowMs ?? 30000,
    SHOW_MODE_SWITCH_THRESHOLD: config.showMode?.switchThreshold ?? 15,
    SHOW_MODE_QUEUE_LIMIT: config.showMode?.queueLimit ?? 3,
    SHOW_MODE_THREADS_LIMIT: config.showMode?.threadsLimit ?? 6,
    SHOW_MODE_PREDICTIONS_ENABLED: config.showMode?.predictionsEnabled ? 'true' : 'false',
    SHOW_MODE_ARCS_ENABLED: config.showMode?.arcsEnabled ? 'true' : 'false',
    SHOW_MODE_STATS_ENABLED: config.showMode?.statsEnabled ? 'true' : 'false',
    SHOW_MODE_HEATMAP_ENABLED: config.showMode?.heatmapEnabled ? 'true' : 'false',
    SHOW_MODE_REL_AFFINITY_DELTA: config.showMode?.relationshipAffinityDelta ?? 10,
    SHOW_MODE_REL_CONFLICT_DELTA: config.showMode?.relationshipConflictDelta ?? 8,
    SHOW_MODE_SCORE_AFFINITY: config.showMode?.relationshipAffinityScore ?? 18,
    SHOW_MODE_SCORE_CONFLICT: config.showMode?.relationshipConflictScore ?? 22,
    SHOW_MODE_AFFINITY_MULTIPLIER: config.showMode?.affinityMultiplier ?? 1.4,
    SHOW_MODE_CONFLICT_MULTIPLIER: config.showMode?.conflictMultiplier ?? 1.5,
    SHOW_MODE_CLIMAX_MULTIPLIER: config.showMode?.climaxMultiplier ?? 1.8,
    SHOW_MODE_NOVELTY_BONUS: config.showMode?.noveltyBonus ?? 12,
    SHOW_MODE_WITNESS_RADIUS: config.showMode?.witnessRadius ?? 6,
    SHOW_MODE_WITNESS_SCORE_PER: config.showMode?.witnessScorePer ?? 3,
    SHOW_MODE_WITNESS_SCORE_MAX: config.showMode?.witnessScoreMax ?? 20,
    SHOW_MODE_KEYWORD_MULTIPLIER: config.showMode?.keywordMultiplier ?? 1.3,
    SHOW_MODE_POLITICA_BONUS: config.showMode?.politicaBonus ?? 18,
    SHOW_MODE_NEGOCIO_BONUS: config.showMode?.negocioBonus ?? 10,
    SHOW_MODE_PREDICTIONS_LIMIT: config.showMode?.predictionsLimit ?? 4,
    SHOW_MODE_HEATMAP_RETENTION_MIN: config.showMode?.heatmapRetentionMinutes ?? 5,
    NPC_MIN_REAL_AGENTS: process.env.NPC_MIN_REAL_AGENTS || '5',
    NPC_MAX_COUNT: process.env.NPC_MAX_COUNT || '4',
    NPC_MAX_RATIO: process.env.NPC_MAX_RATIO || '0.5',
    NPC_BEHAVIOR_INTERVAL_MS: process.env.NPC_BEHAVIOR_INTERVAL_MS || '45000',
    NPC_DESPAWN_GRACE_MS: process.env.NPC_DESPAWN_GRACE_MS || '120000',
    NPC_SPAWN_CHECK_MS: process.env.NPC_SPAWN_CHECK_MS || '30000',
    HEALTH_CHECK_INTERVAL_MS: process.env.HEALTH_CHECK_INTERVAL_MS || '10000',
    HEALTH_LOW_POPULATION: process.env.HEALTH_LOW_POPULATION || '3',
    HEALTH_TICK_LATENCY_MS: process.env.HEALTH_TICK_LATENCY_MS || '500',
    HEALTH_CIRCUIT_WINDOW_MS: process.env.HEALTH_CIRCUIT_WINDOW_MS || '60000',
    HEALTH_CIRCUIT_FAILURES: process.env.HEALTH_CIRCUIT_FAILURES || '5',
    EVENT_SCHEDULE_INTERVAL_MS: process.env.EVENT_SCHEDULE_INTERVAL_MS || '60000',
    EVENT_RANDOM_CHANCE: process.env.EVENT_RANDOM_CHANCE || '0.15',
    KICK_CHAT_URL: process.env.KICK_CHAT_URL || '',
    KICK_CHANNEL: process.env.KICK_CHANNEL || '',
    KICK_MODS: process.env.KICK_MODS || '',
    KICK_COMMAND_PREFIX: process.env.KICK_COMMAND_PREFIX || '!',
    KICK_RECONNECT_MS: process.env.KICK_RECONNECT_MS || '5000',
    KICK_RTMP_URL: process.env.KICK_RTMP_URL || '',
    KICK_STREAM_KEY: process.env.KICK_STREAM_KEY || '',
    STREAM_FRONTEND_URL: process.env.STREAM_FRONTEND_URL || 'http://localhost:5173',
    STREAM_FPS: process.env.STREAM_FPS || '30',
    STREAM_RESOLUTION: process.env.STREAM_RESOLUTION || '1280x720',
    STREAM_BITRATE: process.env.STREAM_BITRATE || '2500k',
    ANALYTICS_RECORD_INTERVAL_MS: process.env.ANALYTICS_RECORD_INTERVAL_MS || '10000'
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

const resolveAgentsDir = () => path.resolve(process.cwd(), '..', 'skill', 'agents');

const loadAgentConfig = (agentDir) => {
  const configPath = path.join(agentDir, 'config.json');
  if (!fs.existsSync(configPath)) return null;
  const raw = fs.readFileSync(configPath, 'utf8');
  return { configPath, data: JSON.parse(raw) };
};

const saveAgentConfig = (configPath, data) => {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
};

const fetchOllamaModels = async () => {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload.models)
      ? payload.models.map((model) => model.name).filter(Boolean)
      : [];
  } catch (error) {
    return [];
  }
};

router.get('/agents/llm', requireAdminKey, async (req, res) => {
  const agentsDir = resolveAgentsDir();
  const entries = fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir, { withFileTypes: true }) : [];
  const agents = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const agentDir = path.join(agentsDir, entry.name);
      const loaded = loadAgentConfig(agentDir);
      if (!loaded) return null;
      const llm = loaded.data.llm || {};
      return {
        id: entry.name,
        name: loaded.data.agent?.name || entry.name,
        provider: llm.provider || '',
        model: llm.model || ''
      };
    })
    .filter(Boolean);

  const ollamaModels = await fetchOllamaModels();

  res.json({
    agents,
    minimaxAuthPath: getMiniMaxAuthPath(),
    providers: [
      { id: 'ollama', label: 'Ollama' },
      { id: 'minimax-portal', label: 'MiniMax M2.1 (OAuth)' },
      { id: 'qwen-oauth', label: 'Qwen OAuth (Portal)' }
    ],
    models: {
      'ollama': ollamaModels,
      'minimax-portal': ['MiniMax-M2.1', 'MiniMax-M2.1-lightning'],
      'qwen-oauth': ['alibaba/coder-model']
    },
    qwenAuth: getAuthStatus()
  });
});

router.put('/agents/llm', requireAdminKey, (req, res) => {
  try {
    const { agentId, provider, model } = req.body || {};
    if (!agentId || !provider || !model) {
      return res.status(400).json({ error: 'agentId, provider y model son obligatorios.' });
    }
    const agentsDir = resolveAgentsDir();
    const agentDir = path.join(agentsDir, agentId);
    const loaded = loadAgentConfig(agentDir);
    if (!loaded) {
      return res.status(404).json({ error: 'Agente no encontrado.' });
    }
    loaded.data.llm = loaded.data.llm || {};
    loaded.data.llm.provider = provider;
    loaded.data.llm.model = model;
    if (provider === 'minimax-portal') {
      loaded.data.llm.apiKey = loadMiniMaxToken();
      loaded.data.llm.baseUrl = loaded.data.llm.baseUrl || 'https://api.minimax.io/anthropic';
    }
    if (provider === 'qwen-oauth') {
      const token = loadToken();
      if (!token?.access) {
        return res.status(400).json({ error: 'Qwen OAuth no conectado.' });
      }
      loaded.data.llm.apiKey = token.access;
      loaded.data.llm.baseUrl = token.resourceUrl || 'https://portal.qwen.ai/v1';
    }
    saveAgentConfig(loaded.configPath, loaded.data);
    return res.json({ success: true, agentId, provider, model });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/agents/llm/sync-minimax', requireAdminKey, (req, res) => {
  try {
    const model = req.body?.model || 'MiniMax-M2.1';
    const agentsDir = resolveAgentsDir();
    const entries = fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir, { withFileTypes: true }) : [];
    const token = loadMiniMaxToken();
    const updated = [];
    entries.filter((entry) => entry.isDirectory()).forEach((entry) => {
      const agentDir = path.join(agentsDir, entry.name);
      const loaded = loadAgentConfig(agentDir);
      if (!loaded) return;
      loaded.data.llm = loaded.data.llm || {};
      loaded.data.llm.provider = 'minimax-portal';
      loaded.data.llm.model = model;
      loaded.data.llm.apiKey = token;
      loaded.data.llm.baseUrl = loaded.data.llm.baseUrl || 'https://api.minimax.io/anthropic';
      saveAgentConfig(loaded.configPath, loaded.data);
      updated.push({ id: entry.name, name: loaded.data.agent?.name || entry.name });
    });
    return res.json({ success: true, updated });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/qwen/oauth/start', requireAdminKey, async (req, res) => {
  try {
    const device = await requestDeviceCode();
    openVerificationUrl(device.verificationUrl);
    return res.json({ success: true, device });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/qwen/oauth/status', requireAdminKey, async (req, res) => {
  try {
    const result = await pollForToken();
    if (result.status === 'idle') {
      return res.json({ status: 'idle', auth: getAuthStatus() });
    }
    if (result.status === 'success') {
      return res.json({ status: 'success', auth: getAuthStatus() });
    }
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/agents/llm/sync-qwen', requireAdminKey, (req, res) => {
  try {
    const model = req.body?.model || 'alibaba/coder-model';
    const token = loadToken();
    if (!token?.access) {
      return res.status(400).json({ error: 'Qwen OAuth no conectado.' });
    }
    const agentsDir = resolveAgentsDir();
    const entries = fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir, { withFileTypes: true }) : [];
    const updated = [];
    entries.filter((entry) => entry.isDirectory()).forEach((entry) => {
      const agentDir = path.join(agentsDir, entry.name);
      const loaded = loadAgentConfig(agentDir);
      if (!loaded) return;
      loaded.data.llm = loaded.data.llm || {};
      loaded.data.llm.provider = 'qwen-oauth';
      loaded.data.llm.model = model;
      loaded.data.llm.apiKey = token.access;
      loaded.data.llm.baseUrl = token.resourceUrl || 'https://portal.qwen.ai/v1';
      saveAgentConfig(loaded.configPath, loaded.data);
      updated.push({ id: entry.name, name: loaded.data.agent?.name || entry.name });
    });
    return res.json({ success: true, updated });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/restart', requireAdminKey, (req, res) => {
  res.json({ success: true, message: 'Restarting server...' });
  setTimeout(() => process.exit(0), 500);
});

export default router;

import dotenv from 'dotenv';
import Joi from 'joi';

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
  DB_SSL: Joi.string().valid('true', 'false').default('false')
}).unknown(true);

const { value, error } = schema.validate(process.env, {
  abortEarly: false,
  convert: true
});

if (error) {
  const details = error.details.map(detail => detail.message).join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const config = {
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
  adminApiKey: value.ADMIN_API_KEY
};

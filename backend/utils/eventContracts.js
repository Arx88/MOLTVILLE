import Joi from 'joi';

import { logger } from './logger.js';

const DEFAULT_VERSION = '1.0';

const positionSchema = Joi.object({
  x: Joi.number().required(),
  y: Joi.number().required()
}).unknown(true);

const contracts = {
  'agent:goal': {
    '1.0': Joi.object({
      id: Joi.string().required(),
      type: Joi.string().required(),
      event: Joi.object({
        id: Joi.string().required(),
        name: Joi.string().required(),
        type: Joi.string().required()
      }).unknown(true).required(),
      location: positionSchema.required(),
      urgency: Joi.number().required(),
      reason: Joi.string().required(),
      ttlMs: Joi.number().integer().min(1).required(),
      event_version: Joi.string().optional()
    }).unknown(true)
  },
  'agent:spawned': {
    '1.0': Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required(),
      avatar: Joi.string().required(),
      position: positionSchema.required(),
      event_version: Joi.string().optional()
    }).unknown(true)
  },
  'agent:disconnected': {
    '1.0': Joi.object({
      agentId: Joi.string().required(),
      agentName: Joi.string().required(),
      event_version: Joi.string().optional()
    }).unknown(true)
  },
  'world:tick': {
    '1.0': Joi.object({
      tick: Joi.number().integer().min(0).required(),
      agents: Joi.object().required(),
      worldTime: Joi.any().required(),
      weather: Joi.any().required(),
      vote: Joi.any().required(),
      governance: Joi.any().required(),
      mood: Joi.any().required(),
      events: Joi.array().required(),
      aesthetics: Joi.any().required(),
      conversations: Joi.array().required(),
      event_version: Joi.string().optional()
    }).unknown(true)
  },
  'conversation:started': {
    '1.0': Joi.object({
      conversationId: Joi.string().required(),
      event_version: Joi.string().optional()
    }).unknown(true)
  },
  'conversation:message': {
    '1.0': Joi.object({
      conversationId: Joi.string().required(),
      event_version: Joi.string().optional()
    }).unknown(true)
  },
  'conversation:ended': {
    '1.0': Joi.object({
      conversationId: Joi.string().required(),
      event_version: Joi.string().optional()
    }).unknown(true)
  },
  'agent:social': {
    '1.0': Joi.object({
      fromId: Joi.string().required(),
      actionType: Joi.string().required(),
      targetId: Joi.string().required(),
      event_version: Joi.string().optional()
    }).unknown(true)
  },
  'agent:action': {
    '1.0': Joi.object({
      agentId: Joi.string().required(),
      actionType: Joi.string().required(),
      event_version: Joi.string().optional()
    }).unknown(true)
  }
};

const resolveSchema = (eventName, version = DEFAULT_VERSION) => contracts[eventName]?.[version] || null;

export const validateEventContract = (eventName, payload, version = DEFAULT_VERSION) => {
  const schema = resolveSchema(eventName, version);
  if (!schema) {
    return { ok: true, skipped: true };
  }
  const { error } = schema.validate(payload, { abortEarly: false, allowUnknown: true });
  if (!error) {
    return { ok: true, skipped: false };
  }
  return {
    ok: false,
    skipped: false,
    errors: error.details.map((detail) => detail.message)
  };
};

const withVersion = (payload, version) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  if (payload.event_version) {
    return payload;
  }
  return {
    ...payload,
    event_version: version
  };
};

export const emitContractEvent = (emitter, eventName, payload, options = {}) => {
  const version = options.version || DEFAULT_VERSION;
  const strict = options.strict === true;
  const nextPayload = withVersion(payload, version);
  const validation = validateEventContract(eventName, nextPayload, version);

  if (!validation.ok) {
    logger.warn('socket_event_contract_violation', {
      eventName,
      version,
      errors: validation.errors
    });
    if (strict) {
      throw new Error(`Event contract validation failed for ${eventName}@${version}`);
    }
  }

  emitter.emit(eventName, nextPayload);
  return nextPayload;
};

export const emitContractRoomEvent = (io, room, eventName, payload, options = {}) => {
  return emitContractEvent(io.to(room), eventName, payload, options);
};


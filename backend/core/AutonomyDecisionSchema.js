export const AUTONOMY_DECISION_VERSION = '1.0';

export const AUTONOMY_ACTION_TYPES = new Set([
  'none',
  'move_to_position',
  'move_to_agent',
  'move_to_building',
  'social_action',
  'queue_action',
  'apply_job',
  'vote_job',
  'negotiate_propose',
  'negotiate_counter',
  'negotiate_accept',
  'commitment_declare',
  'favor_create',
  'favor_repay'
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const sanitizeText = (value, max = 600) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max).trim();
};

const extractJsonCandidate = (raw) => {
  const source = String(raw ?? '').trim();
  if (!source) return '';

  const fencedMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return source.slice(firstBrace, lastBrace + 1).trim();
  }

  return source;
};

export function parseDecisionPayload(raw) {
  const candidate = extractJsonCandidate(raw);
  if (!candidate) {
    return { valid: false, errors: ['empty_payload'], value: null };
  }

  try {
    const parsed = JSON.parse(candidate);
    return { valid: true, errors: [], value: parsed };
  } catch {
    return { valid: false, errors: ['invalid_json'], value: null };
  }
}

export function validateAutonomyDecision(input) {
  const errors = [];

  if (!isObject(input)) {
    return { valid: false, errors: ['decision_not_object'], value: null };
  }

  const goal = sanitizeText(input.goal, 400);
  if (!goal) errors.push('goal_required');

  const thought = sanitizeText(input.thought, 800);
  const utterance = sanitizeText(input.utterance, 280);

  const action = isObject(input.action) ? input.action : null;
  if (!action) {
    errors.push('action_required');
  }

  const actionType = sanitizeText(action?.type, 64);
  if (!actionType) {
    errors.push('action_type_required');
  } else if (!AUTONOMY_ACTION_TYPES.has(actionType)) {
    errors.push(`action_type_invalid:${actionType}`);
  }

  const target = action?.target === undefined || action?.target === null
    ? null
    : sanitizeText(action.target, 120);

  const params = isObject(action?.params) ? action.params : {};

  let nextThinkMs = Number(input.nextThinkMs);
  if (!Number.isFinite(nextThinkMs)) {
    nextThinkMs = 12000;
  }
  nextThinkMs = clamp(Math.floor(nextThinkMs), 1500, 120000);

  if (errors.length) {
    return { valid: false, errors, value: null };
  }

  return {
    valid: true,
    errors: [],
    value: {
      version: AUTONOMY_DECISION_VERSION,
      goal,
      thought,
      utterance,
      nextThinkMs,
      action: {
        type: actionType,
        target,
        params
      }
    }
  };
}

export function parseAndValidateDecision(raw) {
  const parsed = parseDecisionPayload(raw);
  if (!parsed.valid) return parsed;
  return validateAutonomyDecision(parsed.value);
}

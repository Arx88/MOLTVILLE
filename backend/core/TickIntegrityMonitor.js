import crypto from 'crypto';
import { logger } from '../utils/logger.js';

const canonicalize = (value, stack = []) => {
  if (value === null) return null;

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item, stack));
  }

  if (value instanceof Map) {
    if (stack.includes(value)) return '[Circular]';
    const nextStack = [...stack, value];
    return Array.from(value.entries())
      .map(([key, entryValue]) => [String(key), canonicalize(entryValue, nextStack)])
      .sort(([left], [right]) => left.localeCompare(right));
  }

  if (value instanceof Set) {
    if (stack.includes(value)) return '[Circular]';
    const nextStack = [...stack, value];
    return Array.from(value.values())
      .map((item) => canonicalize(item, nextStack))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }

  if (typeof value === 'object') {
    if (stack.includes(value)) return '[Circular]';
    const nextStack = [...stack, value];
    const normalized = {};

    for (const key of Object.keys(value).sort()) {
      const normalizedValue = canonicalize(value[key], nextStack);
      if (typeof normalizedValue !== 'undefined') {
        normalized[key] = normalizedValue;
      }
    }

    return normalized;
  }

  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }

  return value;
};

const stableStringify = (value) => JSON.stringify(canonicalize(value) ?? null);

export class TickIntegrityMonitor {
  constructor() {
    this.snapshots = new Map();
  }

  startTick(tickId, state, correlationId = null) {
    const snapshot = this.computeHash(state);
    this.snapshots.set(tickId, snapshot);
    logger.debug('tick_snapshot_start', { tickId, correlationId, checksum: snapshot });
    return snapshot;
  }

  finishTick(tickId, state, correlationId = null) {
    const before = this.snapshots.get(tickId);
    const after = this.computeHash(state);
    this.snapshots.delete(tickId);

    const changed = before !== after;

    // Always emit end-of-tick checksum telemetry for auditability.
    logger.debug('tick_snapshot_end', { tickId, correlationId, before, after, changed });

    if (changed) {
      logger.debug('tick_snapshot_changed', { tickId, correlationId, before, after });
    }

    return { before, after, changed };
  }

  computeHash(state) {
    const normalized = stableStringify(state || {});
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }
}

export default TickIntegrityMonitor;

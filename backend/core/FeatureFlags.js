import { logger } from '../utils/logger.js';

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

export class FeatureFlags {
  constructor(initial = {}) {
    this.flags = new Map();
    this.loadFromEnv();
    Object.entries(initial).forEach(([key, value]) => this.flags.set(key, Boolean(value)));
  }

  loadFromEnv() {
    this.flags.set('telemetry.enabled', parseBoolean(process.env.TELEMETRY_ENABLED, true));
    this.flags.set('economy.v2', parseBoolean(process.env.ECONOMY_V2_ENABLED, false));
    this.flags.set('tick.snapshot.enabled', parseBoolean(process.env.TICK_SNAPSHOT_ENABLED, true));
  }

  isEnabled(flagName) {
    return Boolean(this.flags.get(flagName));
  }

  has(flagName) {
    return this.flags.has(flagName);
  }

  set(flagName, value, metadata = {}) {
    const previous = this.flags.get(flagName);
    const next = Boolean(value);
    this.flags.set(flagName, next);
    logger.info('feature_flag_changed', {
      flagName,
      previous,
      value: next,
      source: metadata.source || 'runtime',
      reason: metadata.reason || null
    });
    return next;
  }

  toJSON() {
    return Object.fromEntries(this.flags.entries());
  }

  list() {
    return this.toJSON();
  }
}

export default FeatureFlags;

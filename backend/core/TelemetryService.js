import { logger } from '../utils/logger.js';

export class TelemetryService {
  constructor(options = {}) {
    this.events = [];
    this.maxEvents = options.maxEvents || 5000;
  }

  track(eventName, payload = {}, meta = {}) {
    const entry = {
      id: `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      event: eventName,
      payload,
      meta: {
        tickId: meta.tickId ?? null,
        correlationId: meta.correlationId ?? null,
        manager: meta.manager ?? null
      },
      timestamp: Date.now()
    };

    this.events.push(entry);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    if (meta.log !== false) {
      logger.info('telemetry_event', entry);
    }

    return entry;
  }

  trackManagerMetric(manager, metric, value, meta = {}) {
    return this.track('manager.metric', {
      manager,
      metric,
      value
    }, meta);
  }

  list(limit = 50) {
    return this.events.slice(-limit);
  }
}

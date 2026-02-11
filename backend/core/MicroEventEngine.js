import { logger } from '../utils/logger.js';

export class MicroEventEngine {
  constructor(dependencies = {}) {
    this.worldState = dependencies.worldState;
    this.moltbotRegistry = dependencies.moltbotRegistry;
    this.io = dependencies.io;
    this.enabled = process.env.ENABLE_MICRO_EVENTS === 'true';
    this.lastTick = Date.now();
    this.tickIntervalMs = parseInt(process.env.MICRO_EVENT_TICK_MS || '15000', 10);
    this.defaultExpirationMs = parseInt(process.env.MICRO_EVENT_EXPIRATION_MS || '90000', 10);
    this.events = new Map();
    this.metrics = { totalGenerated: 0, totalExpired: 0, errors: 0, byType: {} };

    if (!this.worldState || !this.moltbotRegistry) {
      throw new Error('MicroEventEngine requires worldState and moltbotRegistry');
    }
    if (!Array.isArray(this.worldState.microEvents)) this.worldState.microEvents = [];
  }

  tick() {
    if (!this.enabled) return;
    const now = Date.now();
    if (now - this.lastTick < this.tickIntervalMs) return;
    this.lastTick = now;

    try {
      this.cleanExpiredEvents();
      if (Math.random() < 0.25) this.generateGathering();
    } catch (error) {
      this.metrics.errors += 1;
      logger.warn('MicroEvent tick failed', { error: error?.message || String(error) });
    }
  }

  generateGathering() {
    const buildings = this.worldState.buildings || [];
    if (!buildings.length) return;
    const spot = buildings[Math.floor(Math.random() * buildings.length)];
    if (!spot) return;

    const event = {
      id: `micro_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: 'spontaneous_gathering',
      message: `Gathering near ${spot.name || 'town center'}`,
      location: {
        x: spot.x + Math.floor((spot.width || 1) / 2),
        y: spot.y + Math.floor((spot.height || 1) / 2)
      },
      createdAt: Date.now(),
      expiresAt: Date.now() + this.defaultExpirationMs
    };

    this.events.set(event.id, event);
    this.worldState.microEvents.push(event);
    this.metrics.totalGenerated += 1;
    this.metrics.byType[event.type] = (this.metrics.byType[event.type] || 0) + 1;

    if (this.io) this.io.to('agents').emit('world:micro_event', event);
  }

  cleanExpiredEvents() {
    const now = Date.now();
    for (const [id, event] of this.events.entries()) {
      if ((event?.expiresAt || 0) <= now) {
        this.events.delete(id);
        this.metrics.totalExpired += 1;
      }
    }
    this.worldState.microEvents = (this.worldState.microEvents || []).filter(e => (e?.expiresAt || 0) > now);
  }

  getMetrics() {
    return { ...this.metrics, activeEvents: this.events.size };
  }
}

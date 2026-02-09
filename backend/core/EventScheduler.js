import { logger } from '../utils/logger.js';

export class EventScheduler {
  constructor({ eventManager, worldState, cityMoodManager }) {
    this.eventManager = eventManager;
    this.worldState = worldState;
    this.cityMoodManager = cityMoodManager;

    this.lastScheduleCheck = 0;
    this.scheduleIntervalMs = parseInt(process.env.EVENT_SCHEDULE_INTERVAL_MS || '60000', 10);

    this.dailyEvents = [
      { name: 'Mercado Matinal', type: 'market', hour: 9, location: 'market', durationMs: 60 * 60 * 1000 },
      { name: 'Almuerzo en Plaza', type: 'social', hour: 13, location: 'plaza', durationMs: 60 * 60 * 1000 },
      { name: 'Plaza Vespertina', type: 'plaza', hour: 18, location: 'plaza', durationMs: 90 * 60 * 1000 }
    ];

    this.weeklyEvents = [
      { name: 'Festival del Sábado', type: 'festival', day: 6, hour: 17, location: 'plaza', durationMs: 2 * 60 * 60 * 1000 }
    ];

    logger.info('EventScheduler initialized');
  }

  tick() {
    const now = Date.now();
    if (now - this.lastScheduleCheck < this.scheduleIntervalMs) return;
    this.lastScheduleCheck = now;

    this.ensureDailyEvents(now);
    this.ensureWeeklyEvents(now);
    this.maybeTriggerRandomEvent(now);
    this.maybeTriggerConditionalEvent(now);
  }

  ensureDailyEvents(now) {
    this.dailyEvents.forEach(event => {
      const startAt = this.nextOccurrence(event.hour, now);
      if (!this.hasScheduledEvent(event.name, startAt)) {
        this.eventManager.createEvent({
          name: event.name,
          type: event.type,
          startAt,
          endAt: startAt + event.durationMs,
          location: event.location,
          description: `${event.name} para reunir a la comunidad.`,
          goalScope: 'radius'
        });
      }
    });
  }

  ensureWeeklyEvents(now) {
    this.weeklyEvents.forEach(event => {
      const startAt = this.nextWeeklyOccurrence(event.day, event.hour, now);
      if (!this.hasScheduledEvent(event.name, startAt)) {
        this.eventManager.createEvent({
          name: event.name,
          type: event.type,
          startAt,
          endAt: startAt + event.durationMs,
          location: event.location,
          description: 'Evento semanal para mantener el hype.',
          goalScope: 'global'
        });
      }
    });
  }

  maybeTriggerRandomEvent(now) {
    const chance = parseFloat(process.env.EVENT_RANDOM_CHANCE || '0.15');
    if (Math.random() > chance) return;

    const randomEvents = [
      { name: 'Tormenta Repentina', type: 'storm', location: 'plaza', durationMs: 45 * 60 * 1000 },
      { name: 'Celebridad en la Ciudad', type: 'celebrity', location: 'plaza', durationMs: 30 * 60 * 1000 },
      { name: 'Tesoro Perdido', type: 'treasure', location: 'market', durationMs: 45 * 60 * 1000 }
    ];
    const event = randomEvents[Math.floor(Math.random() * randomEvents.length)];
    this.eventManager.createEvent({
      name: event.name,
      type: event.type,
      startAt: now,
      endAt: now + event.durationMs,
      location: event.location,
      description: 'Evento sorpresa para generar drama.',
      goalScope: 'global'
    });
  }

  maybeTriggerConditionalEvent(now) {
    if (!this.cityMoodManager) return;
    const mood = this.cityMoodManager.getSummary();
    if (!mood) return;

    if (mood.stability < 0.3 && !this.hasActiveEventType('crisis')) {
      this.eventManager.createEvent({
        name: 'Crisis Económica',
        type: 'crisis',
        startAt: now,
        endAt: now + 45 * 60 * 1000,
        location: 'plaza',
        description: 'La ciudad discute medidas de emergencia.',
        goalScope: 'global'
      });
    }

    if (mood.cohesion < 0.25 && !this.hasActiveEventType('debate')) {
      this.eventManager.createEvent({
        name: 'Debate Público',
        type: 'debate',
        startAt: now,
        endAt: now + 30 * 60 * 1000,
        location: 'plaza',
        description: 'Los agentes discuten sobre el futuro de la ciudad.',
        goalScope: 'global'
      });
    }
  }

  nextOccurrence(hour, now) {
    const date = new Date(now);
    const target = new Date(date);
    target.setHours(hour, 0, 0, 0);
    if (target.getTime() <= now) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime();
  }

  nextWeeklyOccurrence(day, hour, now) {
    const date = new Date(now);
    const target = new Date(date);
    target.setHours(hour, 0, 0, 0);
    const dayDiff = (day - target.getDay() + 7) % 7;
    target.setDate(target.getDate() + dayDiff);
    if (target.getTime() <= now) {
      target.setDate(target.getDate() + 7);
    }
    return target.getTime();
  }

  hasScheduledEvent(name, startAt) {
    const existing = this.eventManager.listEvents();
    return existing.some(event => event.name === name && event.startAt === startAt);
  }

  hasActiveEventType(type) {
    return this.eventManager.getSummary().some(event => event.type === type && event.status === 'active');
  }
}

import { logger } from '../utils/logger.js';

export class EventManager {
  constructor({ io } = {}) {
    this.io = io || null;
    this.events = new Map();
  }

  createEvent({
    id,
    name,
    type = 'festival',
    startAt,
    endAt,
    location = null,
    description = ''
  }) {
    if (!name) {
      throw new Error('name is required');
    }
    const now = Date.now();
    const startTimestamp = Number(startAt ?? now);
    if (!Number.isFinite(startTimestamp)) {
      throw new Error('startAt must be a valid timestamp');
    }
    const endTimestamp = endAt === undefined || endAt === null ? null : Number(endAt);
    if (endTimestamp !== null && (!Number.isFinite(endTimestamp) || endTimestamp <= startTimestamp)) {
      throw new Error('endAt must be a valid timestamp after startAt');
    }

    const eventId = id || `event_${now}_${Math.floor(Math.random() * 1000)}`;
    if (this.events.has(eventId)) {
      throw new Error('event id already exists');
    }

    const status = startTimestamp <= now
      ? (endTimestamp && endTimestamp <= now ? 'ended' : 'active')
      : 'scheduled';

    const event = {
      id: eventId,
      name,
      type,
      startAt: startTimestamp,
      endAt: endTimestamp,
      location,
      description,
      status,
      lastEmittedStatus: status === 'active' ? 'started' : null
    };

    this.events.set(eventId, event);
    if (status === 'active') {
      this.emitEvent('event:started', event);
    }
    logger.info(`Event created: ${event.name} (${event.id})`);
    return event;
  }

  listEvents() {
    return Array.from(this.events.values()).sort((a, b) => a.startAt - b.startAt);
  }

  getSummary() {
    return this.listEvents().map(event => ({
      id: event.id,
      name: event.name,
      type: event.type,
      startAt: event.startAt,
      endAt: event.endAt,
      location: event.location,
      description: event.description,
      status: event.status
    }));
  }

  tick() {
    const now = Date.now();
    this.events.forEach(event => {
      let nextStatus = event.status;
      if (event.status === 'scheduled' && event.startAt <= now) {
        nextStatus = 'active';
      }
      if (event.status === 'active' && event.endAt && event.endAt <= now) {
        nextStatus = 'ended';
      }
      if (nextStatus !== event.status) {
        event.status = nextStatus;
        if (nextStatus === 'active') {
          this.emitEvent('event:started', event);
        } else if (nextStatus === 'ended') {
          this.emitEvent('event:ended', event);
        }
      }
    });
  }

  emitEvent(channel, event) {
    if (!this.io) return;
    this.io.to('viewers').emit(channel, {
      id: event.id,
      name: event.name,
      type: event.type,
      startAt: event.startAt,
      endAt: event.endAt,
      location: event.location,
      description: event.description,
      status: event.status
    });
  }

  createSnapshot() {
    return {
      events: this.listEvents().map(event => ({
        ...event
      }))
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot) return;
    this.events = new Map();
    const now = Date.now();
    (snapshot.events || []).forEach(event => {
      if (!event || !event.id || !event.name) return;
      const startAt = Number(event.startAt ?? now);
      if (!Number.isFinite(startAt)) return;
      const endAt = event.endAt === undefined || event.endAt === null ? null : Number(event.endAt);
      if (endAt !== null && (!Number.isFinite(endAt) || endAt <= startAt)) return;
      const status = startAt <= now
        ? (endAt && endAt <= now ? 'ended' : 'active')
        : 'scheduled';
      this.events.set(event.id, {
        id: event.id,
        name: event.name,
        type: event.type || 'festival',
        startAt,
        endAt,
        location: event.location || null,
        description: event.description || '',
        status,
        lastEmittedStatus: event.lastEmittedStatus || (status === 'active' ? 'started' : null)
      });
    });
  }
}

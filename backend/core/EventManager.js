import { logger } from '../utils/logger.js';

export class EventManager {
  constructor({ io, economyManager = null, reputationManager = null, interactionEngine = null } = {}) {
    this.io = io || null;
    this.economyManager = economyManager;
    this.reputationManager = reputationManager;
    this.interactionEngine = interactionEngine;
    this.events = new Map();
  }

  createEvent({
    id,
    name,
    type = 'festival',
    startAt,
    endAt,
    location = null,
    description = '',
    goalScope = 'radius',
    capacity = null,
    entryPrice = 0
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

    const parsedCapacity = capacity === null || capacity === undefined ? null : Number(capacity);
    if (parsedCapacity !== null && (!Number.isFinite(parsedCapacity) || parsedCapacity <= 0)) {
      throw new Error('capacity must be a positive number');
    }
    const parsedEntryPrice = Number(entryPrice || 0);
    if (!Number.isFinite(parsedEntryPrice) || parsedEntryPrice < 0) {
      throw new Error('entryPrice must be >= 0');
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
      goalScope,
      status,
      hostId: location?.hostId || null,
      participants: location?.hostId ? [location.hostId] : [],
      capacity: parsedCapacity,
      entryPrice: Number(parsedEntryPrice.toFixed(2)),
      impact: {
        hostReputationDelta: 0,
        socialBoostPerJoin: 1.25
      },
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
      goalScope: event.goalScope,
      status: event.status,
      hostId: event.hostId || null,
      participants: event.participants || [],
      participantsCount: Array.isArray(event.participants) ? event.participants.length : 0,
      capacity: event.capacity ?? null,
      entryPrice: event.entryPrice ?? 0,
      impact: event.impact || { hostReputationDelta: 0, socialBoostPerJoin: 1.25 }
    }));
  }

  joinEvent(eventId, agentId) {
    if (!eventId || !agentId) return { error: 'invalid_join_payload' };
    const event = this.events.get(eventId);
    if (!event) return { error: 'event_not_found' };
    if (!Array.isArray(event.participants)) event.participants = [];
    if (event.status !== 'active') return { error: 'event_not_active', event };

    if (!event.participants.includes(agentId)) {
      const capacity = Number(event.capacity);
      if (Number.isFinite(capacity) && capacity > 0 && event.participants.length >= capacity) {
        return { error: 'event_full', event };
      }

      const fee = Number(event.entryPrice || 0);
      if (fee > 0 && this.economyManager) {
        const balance = Number(this.economyManager.getBalance(agentId) || 0);
        if (balance < fee) {
          return { error: 'insufficient_funds', event };
        }
        this.economyManager.decrementBalance(agentId, fee, `event_entry:${event.id}`);
        if (event.hostId && event.hostId !== agentId) {
          this.economyManager.incrementBalance(event.hostId, fee, `event_host_income:${event.id}`);
        }
      }

      event.participants.push(agentId);
      if (this.reputationManager && event.hostId) {
        this.reputationManager.adjust(event.hostId, 0.35, { reason: 'event_joined', eventId: event.id, participantId: agentId });
      }
      this.emitEvent('event:joined', {
        ...event,
        joinedBy: agentId
      });
      logger.info(`Event joined: ${event.id} by ${agentId}`);
    }
    return { event };
  }

  tick() {
    const transitions = [];
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
        transitions.push({ event: { ...event }, status: nextStatus });
        if (nextStatus === 'active') {
          this.emitEvent('event:started', event);
        } else if (nextStatus === 'ended') {
          this.emitEvent('event:ended', event);
        }
      }
    });
    return transitions;
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
      goalScope: event.goalScope,
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
        goalScope: event.goalScope || 'radius',
        status,
        hostId: event.hostId || (event.location?.hostId || null),
        participants: Array.isArray(event.participants) ? event.participants : [],
        capacity: Number.isFinite(Number(event.capacity)) ? Number(event.capacity) : null,
        entryPrice: Number.isFinite(Number(event.entryPrice)) ? Number(event.entryPrice) : 0,
        impact: event.impact || { hostReputationDelta: 0, socialBoostPerJoin: 1.25 },
        lastEmittedStatus: event.lastEmittedStatus || (status === 'active' ? 'started' : null)
      });
    });
  }
}

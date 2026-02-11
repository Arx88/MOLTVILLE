import { logger } from '../utils/logger.js';

const EVENT_DELTAS = {
  commitment_kept: { reliability: 2.4, cooperation: 0.8, civility: 0.4 },
  commitment_broken: { reliability: -3.0, cooperation: -1.0, civility: -0.5 },
  help_delivered: { reliability: 0.8, cooperation: 2.2, civility: 0.6 },
  spam_or_repeat: { reliability: -0.3, cooperation: -0.4, civility: -1.1 }
};

const clamp = (n, min = -100, max = 100) => Math.max(min, Math.min(max, Number(n) || 0));

export class ReputationManager {
  constructor() {
    this.reputation = new Map();
    this.events = [];
  }

  ensure(agentId) {
    if (!this.reputation.has(agentId)) {
      this.reputation.set(agentId, {
        reliability: 0,
        cooperation: 0,
        civility: 0,
        score: 0,
        events: 0,
        lastUpdated: Date.now()
      });
    }
    return this.reputation.get(agentId);
  }

  recomputeScore(rep) {
    rep.score = Number(((rep.reliability * 0.4) + (rep.cooperation * 0.35) + (rep.civility * 0.25)).toFixed(2));
  }

  adjust(agentId, delta = 0, context = {}) {
    const rep = this.ensure(agentId);
    rep.reliability = clamp(rep.reliability + delta);
    rep.cooperation = clamp(rep.cooperation + (delta * 0.8));
    rep.civility = clamp(rep.civility + (delta * 0.5));
    rep.events += 1;
    rep.lastUpdated = Date.now();
    this.recomputeScore(rep);
    logger.info(`Reputation adjusted: ${agentId} (${delta})`);
    return this.getSnapshot(agentId);
  }

  applyEvent(agentId, eventType, metadata = {}) {
    const deltas = EVENT_DELTAS[eventType];
    if (!deltas) {
      throw new Error(`Unsupported reputation event: ${eventType}`);
    }
    const rep = this.ensure(agentId);
    rep.reliability = clamp(rep.reliability + deltas.reliability);
    rep.cooperation = clamp(rep.cooperation + deltas.cooperation);
    rep.civility = clamp(rep.civility + deltas.civility);
    rep.events += 1;
    rep.lastUpdated = Date.now();
    this.recomputeScore(rep);

    this.events.push({ agentId, eventType, metadata, at: Date.now() });
    if (this.events.length > 2000) {
      this.events.splice(0, this.events.length - 2000);
    }

    logger.info(`Reputation event: ${eventType} -> ${agentId}`);
    return this.getSnapshot(agentId);
  }

  leaderboard(limit = 25) {
    return Array.from(this.reputation.entries())
      .map(([agentId, rep]) => ({ agentId, ...this.getSnapshot(agentId) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Number(limit) || 25));
  }

  getSnapshot(agentId) {
    const rep = this.ensure(agentId);
    return {
      reliability: Number(rep.reliability.toFixed(2)),
      cooperation: Number(rep.cooperation.toFixed(2)),
      civility: Number(rep.civility.toFixed(2)),
      score: Number(rep.score.toFixed(2)),
      events: rep.events,
      lastUpdated: rep.lastUpdated
    };
  }

  createSnapshot() {
    return {
      entries: Array.from(this.reputation.entries()),
      events: this.events.slice(-500)
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot) return;
    this.reputation = new Map(snapshot.entries || []);
    this.events = Array.isArray(snapshot.events) ? snapshot.events : [];
  }
}

export const ReputationEvents = Object.freeze(Object.keys(EVENT_DELTAS));

import { logger } from '../utils/logger.js';

export class CityMoodManager {
  constructor(economyManager, interactionEngine) {
    this.economyManager = economyManager;
    this.interactionEngine = interactionEngine;
    this.modifiers = [];
    this.mood = this.calculateMood();
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  addModifier({ id = null, source = 'system', prosperity = 0, cohesion = 0, stability = 0, durationMs = 10 * 60 * 1000, metadata = {} } = {}) {
    const now = Date.now();
    const entry = {
      id: id || `mood-mod-${now}-${Math.random().toString(16).slice(2)}`,
      source,
      prosperity: Number(prosperity) || 0,
      cohesion: Number(cohesion) || 0,
      stability: Number(stability) || 0,
      createdAt: now,
      expiresAt: now + Math.max(60 * 1000, Number(durationMs) || 0),
      metadata
    };

    this.modifiers.push(entry);
    logger.info(`CityMood modifier added: ${entry.id} (${source})`);
    return entry;
  }

  expireModifiers() {
    const now = Date.now();
    const before = this.modifiers.length;
    this.modifiers = this.modifiers.filter((modifier) => modifier.expiresAt > now);
    return before - this.modifiers.length;
  }

  getActiveModifiers() {
    return this.modifiers
      .filter((modifier) => modifier.expiresAt > Date.now())
      .map((modifier) => ({ ...modifier }));
  }

  calculateMood() {
    const avgBalance = this.economyManager.getAverageBalance();
    const socialStats = this.interactionEngine.getSocialStats();

    const baseProsperity = this.clamp((avgBalance - 10) / 40, 0, 1);
    const baseCohesion = this.clamp(socialStats.averageAffinity / 100, 0, 1);
    const baseStability = this.clamp((socialStats.activeEdges / Math.max(1, socialStats.totalAgents)) / 5, 0, 1);

    const modifierTotals = this.getActiveModifiers().reduce((acc, modifier) => {
      acc.prosperity += modifier.prosperity;
      acc.cohesion += modifier.cohesion;
      acc.stability += modifier.stability;
      return acc;
    }, { prosperity: 0, cohesion: 0, stability: 0 });

    return {
      prosperity: this.clamp(baseProsperity + modifierTotals.prosperity, 0, 1),
      cohesion: this.clamp(baseCohesion + modifierTotals.cohesion, 0, 1),
      stability: this.clamp(baseStability + modifierTotals.stability, 0, 1),
      averageBalance: avgBalance,
      social: socialStats,
      modifiers: this.getActiveModifiers(),
      updatedAt: Date.now()
    };
  }

  tick() {
    this.expireModifiers();
    this.mood = this.calculateMood();
  }

  getSummary() {
    return this.mood;
  }

  createSnapshot() {
    return {
      mood: this.mood,
      modifiers: this.modifiers.map((modifier) => ({ ...modifier }))
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot || !snapshot.mood) {
      this.modifiers = [];
      this.mood = this.calculateMood();
      return;
    }
    this.modifiers = Array.isArray(snapshot.modifiers)
      ? snapshot.modifiers.map((modifier) => ({ ...modifier }))
      : [];
    this.mood = { ...snapshot.mood };
  }
}

import { logger } from '../utils/logger.js';

export class CityMoodManager {
  constructor(economyManager, interactionEngine) {
    this.economyManager = economyManager;
    this.interactionEngine = interactionEngine;
    this.mood = this.calculateMood();
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  calculateMood() {
    const avgBalance = this.economyManager.getAverageBalance();
    const socialStats = this.interactionEngine.getSocialStats();
    const prosperity = this.clamp((avgBalance - 10) / 40, 0, 1);
    const cohesion = this.clamp(socialStats.averageAffinity / 100, 0, 1);
    const stability = this.clamp((socialStats.activeEdges / Math.max(1, socialStats.totalAgents)) / 5, 0, 1);

    return {
      prosperity,
      cohesion,
      stability,
      averageBalance: avgBalance,
      social: socialStats,
      updatedAt: Date.now()
    };
  }

  tick() {
    this.mood = this.calculateMood();
  }

  getSummary() {
    return this.mood;
  }

  createSnapshot() {
    return {
      mood: this.mood
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot || !snapshot.mood) {
      this.mood = this.calculateMood();
      return;
    }
    this.mood = { ...snapshot.mood };
  }
}

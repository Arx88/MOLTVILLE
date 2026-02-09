export const buildDramaScore = ({ mood, activeEvents = 0, npcDramaPoints = 0 }) => {
  const stability = mood?.stability ?? 0.5;
  const cohesion = mood?.cohesion ?? 0.5;
  const prosperity = mood?.prosperity ?? 0.5;
  const base = (1 - stability) * 50 + (1 - cohesion) * 30 + (1 - prosperity) * 20;
  const eventBoost = Math.min(20, activeEvents * 5);
  const npcBoost = Math.min(15, npcDramaPoints / 10);
  return Math.max(0, Math.min(100, Math.round(base + eventBoost + npcBoost)));
};

export class AnalyticsStore {
  constructor({ historyLimit = 120 } = {}) {
    this.historyLimit = historyLimit;
    this.history = [];
  }

  record(score) {
    const entry = { timestamp: Date.now(), score };
    this.history.push(entry);
    if (this.history.length > this.historyLimit) {
      this.history.splice(0, this.history.length - this.historyLimit);
    }
  }

  getHistory() {
    return {
      timestamps: this.history.map(entry => entry.timestamp),
      scores: this.history.map(entry => entry.score)
    };
  }
}

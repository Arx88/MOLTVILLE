export class EventService {
  constructor({ eventManager, economyManager, reputationManager }) {
    this.eventManager = eventManager;
    this.economyManager = economyManager;
    this.reputationManager = reputationManager;
    this.ledger = new Map();
  }

  applyIncentives(eventTransitions = []) {
    const activeEvents = this.eventManager.getSummary().filter(event => event.status === 'active');

    activeEvents.forEach((event) => {
      if (!event?.id) return;
      if (!this.ledger.has(event.id)) this.ledger.set(event.id, { attendance: new Set(), completion: new Set() });
      const row = this.ledger.get(event.id);
      (event.participants || []).forEach((agentId) => {
        if (!agentId || row.attendance.has(agentId)) return;
        row.attendance.add(agentId);
        this.economyManager.applySystemPayout(agentId, 1, `event_attendance:${event.id}`);
        this.reputationManager.adjust(agentId, 0.5, { role: 'participant' });
      });
    });

    (eventTransitions || []).filter(entry => entry?.status === 'ended' && entry?.event?.id).forEach(({ event }) => {
      if (!this.ledger.has(event.id)) this.ledger.set(event.id, { attendance: new Set(), completion: new Set() });
      const row = this.ledger.get(event.id);
      (event.participants || []).forEach((agentId) => {
        if (!agentId || row.completion.has(agentId)) return;
        row.completion.add(agentId);
        this.economyManager.applySystemPayout(agentId, 3, `event_completion:${event.id}`);
        this.reputationManager.adjust(agentId, 1, { role: 'participant' });
      });
    });
  }
}

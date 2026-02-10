export class TelemetryService {
  constructor() {
    this.events = [];
    this.maxEvents = 500;
  }

  track(eventName, payload = {}) {
    const entry = {
      id: `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      event: eventName,
      payload,
      timestamp: Date.now()
    };
    this.events.push(entry);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
    return entry;
  }

  list(limit = 50) {
    return this.events.slice(-limit);
  }
}

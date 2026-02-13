export class WorldService {
  constructor({ worldState, governanceManager, cityMoodManager, eventManager, votingManager, aestheticsManager, interactionEngine }) {
    this.worldState = worldState;
    this.governanceManager = governanceManager;
    this.cityMoodManager = cityMoodManager;
    this.eventManager = eventManager;
    this.votingManager = votingManager;
    this.aestheticsManager = aestheticsManager;
    this.interactionEngine = interactionEngine;
  }

  getViewerState() {
    return {
      ...this.worldState.getFullState(),
      governance: this.governanceManager.getSummary(),
      mood: this.cityMoodManager.getSummary(),
      events: this.eventManager.getSummary(),
      conversations: this.interactionEngine.getActiveConversations()
    };
  }

  buildTickPayload() {
    return {
      tick: this.worldState.getCurrentTick(),
      agents: this.worldState.getAllAgentPositions(),
      worldTime: this.worldState.getTimeState(),
      weather: this.worldState.getWeatherState(),
      vote: this.votingManager.getVoteSummary(),
      governance: this.governanceManager.getSummary(),
      mood: this.cityMoodManager.getSummary(),
      events: this.eventManager.getSummary(),
      aesthetics: this.aestheticsManager.getVoteSummary(),
      conversations: this.interactionEngine.getActiveConversations()
    };
  }
}

export class AgentService {
  constructor({ registry, moltbotRegistry, worldState, economyManager, governanceManager, cityMoodManager, reputationManager, favorLedger }) {
    this.registry = registry || moltbotRegistry;
    this.worldState = worldState;
    this.economyManager = economyManager;
    this.governanceManager = governanceManager;
    this.cityMoodManager = cityMoodManager;
    this.reputationManager = reputationManager;
    this.favorLedger = favorLedger;
  }

  buildContext(agentId) {
    return {
      economy: this.economyManager.getAgentSummary(agentId),
      relationships: this.registry.getRelationshipSummaries(agentId),
      favorites: this.registry.getAgentMemory(agentId)?.favorites || { personId: null, locationId: null }
    };
  }

  getViewerAgents() {
    return this.registry.getAllAgents().map(agent => ({
      ...agent,
      reputation: this.reputationManager.getSnapshot(agent.id),
      favors: this.favorLedger.getSummary(agent.id)
    }));
  }

  getAgentPerception(agentId) {
    return {
      ...this.worldState.getAgentView(agentId),
      governance: this.governanceManager.getSummary(),
      mood: this.cityMoodManager.getSummary(),
      context: this.buildContext(agentId)
    };
  }
}

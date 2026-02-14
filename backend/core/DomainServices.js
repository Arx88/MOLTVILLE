import { buildUrbanNeedsHeatmap, getDistrictNeeds } from './UrbanNeedsAnalyzer.js';

export function createDomainServices({
  worldState,
  cityMoodManager,
  eventManager,
  interactionEngine,
  governanceManager,
  economyManager,
  favorLedger,
  reputationManager,
  votingManager,
  moltbotRegistry
}) {
  const world = Object.freeze({
    getState() {
      return {
        ...worldState.getFullState(),
        mood: cityMoodManager.getSummary(),
        events: eventManager.getSummary()
      };
    },
    getBuildings() {
      return worldState.buildings;
    },
    getLots() {
      return worldState.lots;
    },
    getBuilding(buildingId) {
      return worldState.buildings.find((entry) => entry.id === buildingId) || null;
    },
    getSocialNetwork() {
      return interactionEngine.getSocialNetwork();
    },
    getConversations() {
      return interactionEngine.getActiveConversations();
    },
    getNeedsHeatmap() {
      return buildUrbanNeedsHeatmap({ worldState, economyManager });
    },
    getDistrictNeeds(districtId) {
      return getDistrictNeeds({ worldState, economyManager, districtId });
    }
  });

  const governance = Object.freeze({
    getSummary() {
      return governanceManager.getSummary();
    },
    registerCandidate(agentId, name, platform) {
      return governanceManager.registerCandidate(agentId, name, platform, reputationManager);
    },
    castVote(agentId, candidateId) {
      return governanceManager.castVote(agentId, candidateId);
    },
    addPolicy(payload) {
      return governanceManager.setPolicy(payload);
    },
    startNoConfidence(payload) {
      return governanceManager.startNoConfidenceVote(payload);
    },
    castNoConfidenceVote(payload) {
      return governanceManager.castNoConfidenceVote(payload);
    },
    resolveNoConfidence(totalActiveAgents) {
      return governanceManager.resolveNoConfidenceVote(totalActiveAgents);
    }
  });

  const economy = Object.freeze({
    listJobs() {
      return economyManager.listJobs();
    },
    listProperties() {
      return economyManager.listProperties();
    },
    getBalance(agentId) {
      return economyManager.getBalance(agentId);
    },
    getTreasurySummary() {
      return economyManager.getTreasurySummary();
    },
    getTreasuryTransactions(limit = 100) {
      return Array.isArray(economyManager.treasuryTransactions)
        ? economyManager.treasuryTransactions.slice(-Math.max(1, Number(limit) || 100))
        : [];
    },
    spendTreasury({ amount, reason, beneficiaryAgentId = null }) {
      const numericAmount = Number(amount || 0);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error('Amount must be a positive number');
      }
      const current = economyManager.getTreasurySummary();
      if (current.balance < numericAmount) {
        throw new Error('Insufficient treasury balance');
      }
      if (beneficiaryAgentId) {
        economyManager.applySystemPayout(beneficiaryAgentId, numericAmount, `public_fund:${reason}`);
      } else {
        economyManager.recordTreasury(-numericAmount, `public_fund:${reason}`);
      }
      return economyManager.getTreasurySummary();
    }
  });

  const favor = Object.freeze({
    listForAgent(agentId) {
      return favorLedger.listForAgent(agentId);
    },
    getSummary(agentId) {
      return favorLedger.getSummary(agentId);
    },
    getRisk(agentId) {
      return favorLedger.getRiskProfile(agentId);
    },
    listOverdue(agentId) {
      return favorLedger.listOverdue(agentId);
    },
    create(payload) {
      const entry = favorLedger.createFavor(payload);
      reputationManager.adjust(entry.to, 0.8, {
        reason: 'favor_delivered',
        favorId: entry.id,
        from: entry.from,
        to: entry.to
      });
      reputationManager.adjust(entry.from, 0.1, {
        reason: 'favor_received',
        favorId: entry.id,
        from: entry.from,
        to: entry.to
      });
      return entry;
    },
    repay(payload) {
      const result = favorLedger.repayFavor(payload);
      reputationManager.adjust(payload.from, 1.1, {
        reason: 'favor_repaid',
        to: payload.to,
        value: payload.value
      });
      reputationManager.adjust(payload.to, 0.35, {
        reason: 'favor_settlement_received',
        from: payload.from,
        value: payload.value
      });
      return result;
    },
    transfer(payload) {
      return favorLedger.transferFavor(payload);
    }
  });

  const agents = Object.freeze({
    getCount() {
      return moltbotRegistry.getAgentCount();
    }
  });

  return Object.freeze({
    world,
    governance,
    economy,
    favor,
    agents,
    voting: Object.freeze({
      getSummary() {
        return votingManager.getVoteSummary();
      }
    })
  });
}

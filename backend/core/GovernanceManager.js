import { logger } from '../utils/logger.js';

export class GovernanceManager {
  constructor({ economyManager, io }) {
    this.economyManager = economyManager;
    this.io = io;
    this.proposalDurationMs = parseInt(process.env.GOVERNANCE_PROPOSAL_DURATION_MS, 10) || 3600000;
    this.minVotes = parseInt(process.env.GOVERNANCE_MIN_VOTES, 10) || 1;
    this.currentProposal = null;
    this.proposalHistory = [];
  }

  createProposal({ title, description, changes = {}, createdBy = 'system' }) {
    if (this.currentProposal) {
      throw new Error('A proposal is already active');
    }
    const now = Date.now();
    this.currentProposal = {
      id: `proposal-${now}`,
      title,
      description,
      changes,
      createdBy,
      votes: { yes: 0, no: 0 },
      voters: new Set(),
      startsAt: now,
      endsAt: now + this.proposalDurationMs
    };
    this.emitUpdate('governance:started', this.getCurrentProposal());
    logger.info(`Governance: started ${this.currentProposal.id}`);
    return this.currentProposal;
  }

  castVote(agentId, vote) {
    if (!this.currentProposal) {
      throw new Error('No active proposal');
    }
    if (this.currentProposal.voters.has(agentId)) {
      throw new Error('Agent already voted');
    }
    const normalized = String(vote).toLowerCase();
    if (normalized !== 'yes' && normalized !== 'no') {
      throw new Error('Vote must be yes or no');
    }
    this.currentProposal.voters.add(agentId);
    this.currentProposal.votes[normalized] += 1;
    const summary = this.getCurrentProposal();
    this.emitUpdate('governance:updated', summary);
    return summary;
  }

  tick() {
    if (!this.currentProposal) return;
    if (Date.now() >= this.currentProposal.endsAt) {
      this.closeProposal();
    }
  }

  closeProposal() {
    const proposal = this.currentProposal;
    if (!proposal) return null;
    const totalVotes = proposal.votes.yes + proposal.votes.no;
    const passed = totalVotes >= this.minVotes && proposal.votes.yes > proposal.votes.no;

    if (passed) {
      this.applyChanges(proposal.changes);
    }

    const result = {
      id: proposal.id,
      title: proposal.title,
      description: proposal.description,
      changes: proposal.changes,
      votes: proposal.votes,
      totalVotes,
      passed,
      closedAt: Date.now()
    };

    this.proposalHistory.unshift(result);
    this.currentProposal = null;

    this.emitUpdate('governance:closed', result);
    logger.info(`Governance: closed ${proposal.id} passed=${passed}`);
    return result;
  }

  applyChanges(changes) {
    if (!changes) return;
    if (typeof changes.taxRate === 'number') {
      this.economyManager.setTaxRate(changes.taxRate);
    }
    if (typeof changes.reviewThreshold === 'number') {
      this.economyManager.setReviewThreshold(changes.reviewThreshold);
    }
    if (typeof changes.baseIncome === 'number') {
      this.economyManager.setBaseIncome(changes.baseIncome);
    }
  }

  getCurrentProposal() {
    if (!this.currentProposal) return null;
    return {
      id: this.currentProposal.id,
      title: this.currentProposal.title,
      description: this.currentProposal.description,
      changes: this.currentProposal.changes,
      votes: this.currentProposal.votes,
      startsAt: this.currentProposal.startsAt,
      endsAt: this.currentProposal.endsAt
    };
  }

  getPolicySummary() {
    return {
      taxRate: this.economyManager.taxRate,
      reviewThreshold: this.economyManager.reviewThreshold,
      baseIncome: this.economyManager.baseIncome
    };
  }

  emitUpdate(event, payload) {
    if (this.io) {
      this.io.emit(event, payload);
    }
  }
}

import { logger } from '../utils/logger.js';

export class GovernanceManager {
  constructor(io) {
    this.io = io;
    this.electionDurationMs = parseInt(process.env.PRESIDENT_ELECTION_MS, 10) || 86400000;
    this.currentPresident = null;
    this.currentElection = null;
  }

  startElection() {
    if (this.currentElection) return this.currentElection;
    const now = Date.now();
    this.currentElection = {
      id: `election-${now}`,
      candidates: new Map(),
      votes: {},
      voters: new Set(),
      startsAt: now,
      endsAt: now + this.electionDurationMs
    };
    this.io.emit('president:election_started', this.getElectionSummary());
    logger.info(`Governance: election started ${this.currentElection.id}`);
    return this.currentElection;
  }

  registerCandidate(agentId, name, platform = '') {
    if (!this.currentElection) {
      throw new Error('No active election');
    }
    if (this.currentElection.candidates.has(agentId)) {
      throw new Error('Already registered');
    }
    this.currentElection.candidates.set(agentId, {
      agentId,
      name,
      platform
    });
    return this.getElectionSummary();
  }

  castVote(agentId, candidateId) {
    if (!this.currentElection) {
      throw new Error('No active election');
    }
    if (this.currentElection.voters.has(agentId)) {
      throw new Error('Agent already voted');
    }
    if (!this.currentElection.candidates.has(candidateId)) {
      throw new Error('Invalid candidate');
    }
    this.currentElection.voters.add(agentId);
    this.currentElection.votes[candidateId] = (this.currentElection.votes[candidateId] || 0) + 1;
    return this.getElectionSummary();
  }

  tick() {
    if (!this.currentElection) {
      this.startElection();
      return;
    }
    if (Date.now() >= this.currentElection.endsAt) {
      this.closeElection();
      this.startElection();
    }
  }

  closeElection() {
    const election = this.currentElection;
    if (!election) return null;
    const winner = this.selectWinner(election);
    this.currentPresident = winner
      ? {
        agentId: winner.agentId,
        name: winner.name,
        platform: winner.platform,
        electedAt: Date.now()
      }
      : null;
    const result = {
      electionId: election.id,
      winner: this.currentPresident,
      totalVotes: Object.values(election.votes).reduce((sum, count) => sum + count, 0)
    };
    this.io.emit('president:election_closed', result);
    logger.info(`Governance: election closed ${election.id}`);
    this.currentElection = null;
    return result;
  }

  selectWinner(election) {
    const tally = Array.from(election.candidates.values()).map(candidate => ({
      ...candidate,
      votes: election.votes[candidate.agentId] || 0
    }));
    tally.sort((a, b) => b.votes - a.votes);
    return tally[0] || null;
  }

  getElectionSummary() {
    if (!this.currentElection) return null;
    return {
      id: this.currentElection.id,
      candidates: Array.from(this.currentElection.candidates.values()).map(candidate => ({
        ...candidate,
        votes: this.currentElection.votes[candidate.agentId] || 0
      })),
      startsAt: this.currentElection.startsAt,
      endsAt: this.currentElection.endsAt
    };
  }

  getSummary() {
    return {
      president: this.currentPresident,
      election: this.getElectionSummary()
    };
  }
}

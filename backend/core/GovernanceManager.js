import { logger } from '../utils/logger.js';

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export class GovernanceManager {
  constructor(io, options = {}) {
    this.io = io;
    this.db = options.db || null;
    this.electionDurationMs = parseInt(process.env.PRESIDENT_ELECTION_MS, 10) || 86400000;
    this.noConfidenceDurationMs = parseInt(process.env.NO_CONFIDENCE_DURATION_MS || `${20 * 60 * 1000}`, 10);
    this.noConfidenceMinParticipation = toNumber(process.env.NO_CONFIDENCE_MIN_PARTICIPATION, 0.5);
    this.noConfidencePassThreshold = toNumber(process.env.NO_CONFIDENCE_PASS_THRESHOLD, 0.5);
    this.currentPresident = null;
    this.currentElection = null;
    this.noConfidence = null;
    this.policies = [];
  }

  async initializeFromDb() {
    if (!this.db) return;
    const [electionResult, presidentResult] = await Promise.all([
      this.db.query("SELECT * FROM governance_elections WHERE status = 'open' ORDER BY starts_at DESC LIMIT 1"),
      this.db.query('SELECT president FROM governance_president WHERE id = 1')
    ]);
    const policiesResult = await this.db.query("SELECT policy FROM governance_policies WHERE status = 'active'");

    if (presidentResult.rows.length) {
      this.currentPresident = presidentResult.rows[0].president;
    }

    if (electionResult.rows.length) {
      const row = electionResult.rows[0];
      this.currentElection = {
        id: row.election_id,
        candidates: new Map((row.candidates || []).map((candidate) => [candidate.agentId, candidate])),
        votes: row.votes || {},
        voters: new Set(row.voters || []),
        startsAt: Number(row.starts_at),
        endsAt: Number(row.ends_at)
      };
    }

    this.policies = policiesResult.rows.map((row) => row.policy);
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
    this.persistElection('open');
    this.io.emit('president:election_started', this.getElectionSummary());
    logger.info(`Governance: election started ${this.currentElection.id}`);
    return this.currentElection;
  }

  registerCandidate(agentId, name, platform = '', reputationManager = null) {
    if (!this.currentElection) {
      throw new Error('No active election');
    }
    if (this.currentElection.candidates.has(agentId)) {
      throw new Error('Already registered');
    }

    const minReputation = Number(process.env.PRESIDENT_MIN_REPUTATION || 8);
    let reputationScore = null;
    if (reputationManager) {
      reputationScore = Number(reputationManager.getSnapshot(agentId)?.score || 0);
      if (reputationScore < minReputation) {
        throw new Error(`Insufficient reputation to run for president (${reputationScore.toFixed(2)} < ${minReputation})`);
      }
    }

    this.currentElection.candidates.set(agentId, {
      agentId,
      name,
      platform,
      reputationScore
    });
    this.persistElection('open');
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
    this.persistElection('open');
    return this.getElectionSummary();
  }

  startNoConfidenceVote({ initiatorId = null, totalActiveAgents = 0, durationMs = null } = {}) {
    if (!this.currentPresident) {
      throw new Error('No active president to challenge');
    }
    if (this.noConfidence) {
      throw new Error('No-confidence vote already in progress');
    }

    const now = Date.now();
    const duration = Number.isFinite(Number(durationMs))
      ? Number(durationMs)
      : this.noConfidenceDurationMs;

    this.noConfidence = {
      id: `noconf-${now}`,
      targetPresident: { ...this.currentPresident },
      initiatedBy: initiatorId,
      startsAt: now,
      endsAt: now + Math.max(60 * 1000, duration),
      votesFor: new Set(),
      votesAgainst: new Set(),
      status: 'open',
      expectedVoters: Math.max(0, Number(totalActiveAgents) || 0),
      result: null
    };

    this.io.emit('governance:no_confidence_started', this.getNoConfidenceSummary());
    logger.info(`Governance: no-confidence started ${this.noConfidence.id}`);
    return this.getNoConfidenceSummary();
  }

  castNoConfidenceVote({ agentId, support }) {
    if (!this.noConfidence || this.noConfidence.status !== 'open') {
      throw new Error('No active no-confidence vote');
    }
    if (!agentId) {
      throw new Error('agentId is required');
    }
    if (this.noConfidence.votesFor.has(agentId) || this.noConfidence.votesAgainst.has(agentId)) {
      throw new Error('Agent already voted');
    }

    const decision = support === true || support === 'true' || support === 1 || support === '1';
    if (decision) {
      this.noConfidence.votesFor.add(agentId);
    } else {
      this.noConfidence.votesAgainst.add(agentId);
    }

    return this.getNoConfidenceSummary();
  }

  resolveNoConfidenceVote(totalActiveAgents = 0) {
    if (!this.noConfidence || this.noConfidence.status !== 'open') {
      return null;
    }

    const vote = this.noConfidence;
    const votesFor = vote.votesFor.size;
    const votesAgainst = vote.votesAgainst.size;
    const totalVotes = votesFor + votesAgainst;
    const activeAgents = Math.max(1, Number(totalActiveAgents) || vote.expectedVoters || 1);
    const participation = totalVotes / activeAgents;
    const supportRatio = totalVotes > 0 ? votesFor / totalVotes : 0;
    const passed = participation >= this.noConfidenceMinParticipation
      && supportRatio > this.noConfidencePassThreshold;

    const result = {
      id: vote.id,
      targetPresident: vote.targetPresident,
      votesFor,
      votesAgainst,
      totalVotes,
      participation: Number(participation.toFixed(3)),
      supportRatio: Number(supportRatio.toFixed(3)),
      passed,
      resolvedAt: Date.now()
    };

    vote.status = 'closed';
    vote.result = result;

    if (passed) {
      const removedPresident = this.currentPresident ? { ...this.currentPresident } : null;
      this.currentPresident = null;
      this.persistPresident();

      this.setPolicy({
        type: 'governance_emergency',
        value: 1,
        durationMs: 30 * 60 * 1000,
        description: 'No-confidence passed: early election active'
      });

      this.currentElection = null;
      this.startElection();

      this.io.emit('governance:no_confidence_passed', {
        ...result,
        removedPresident
      });
      logger.info(`Governance: no-confidence passed ${vote.id}`);
    } else {
      this.io.emit('governance:no_confidence_failed', result);
      logger.info(`Governance: no-confidence failed ${vote.id}`);
    }

    return result;
  }

  tick(activeAgentCount = 0) {
    const now = Date.now();

    if (this.noConfidence && this.noConfidence.status === 'open' && now >= this.noConfidence.endsAt) {
      this.resolveNoConfidenceVote(activeAgentCount);
    }

    if (!this.currentElection) {
      this.startElection();
      this.expirePolicies();
      return;
    }

    if (now >= this.currentElection.endsAt) {
      this.closeElection();
      this.startElection();
    }

    this.expirePolicies();
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
    this.persistPresident();
    this.persistElection('closed', this.currentPresident);
    this.currentElection = null;
    return result;
  }

  selectWinner(election) {
    const tally = Array.from(election.candidates.values()).map((candidate) => ({
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
      candidates: Array.from(this.currentElection.candidates.values()).map((candidate) => ({
        ...candidate,
        votes: this.currentElection.votes[candidate.agentId] || 0
      })),
      startsAt: this.currentElection.startsAt,
      endsAt: this.currentElection.endsAt
    };
  }

  getNoConfidenceSummary() {
    if (!this.noConfidence) return null;
    const vote = this.noConfidence;
    return {
      id: vote.id,
      status: vote.status,
      targetPresident: vote.targetPresident,
      initiatedBy: vote.initiatedBy,
      startsAt: vote.startsAt,
      endsAt: vote.endsAt,
      votesFor: vote.votesFor.size,
      votesAgainst: vote.votesAgainst.size,
      expectedVoters: vote.expectedVoters,
      result: vote.result
    };
  }

  getSummary() {
    return {
      president: this.currentPresident,
      election: this.getElectionSummary(),
      noConfidence: this.getNoConfidenceSummary(),
      policies: this.policies
    };
  }

  hasActivePolicy(type) {
    return this.policies.some((policy) => policy.type === type);
  }

  setPolicy({ type, value, durationMs, description }) {
    const now = Date.now();
    const policy = {
      id: `policy-${now}`,
      type,
      value,
      description: description || '',
      createdAt: now,
      expiresAt: durationMs ? now + durationMs : null
    };
    this.policies.push(policy);
    this.persistPolicy(policy, 'active');
    this.io.emit('governance:policy_added', policy);
    return policy;
  }

  expirePolicies() {
    const now = Date.now();
    const active = [];
    this.policies.forEach((policy) => {
      if (policy.expiresAt && policy.expiresAt <= now) {
        this.persistPolicy(policy, 'expired');
        this.io.emit('governance:policy_expired', policy);
      } else {
        active.push(policy);
      }
    });
    this.policies = active;
  }

  persistElection(status, winner = null) {
    if (!this.db || !this.currentElection) return;
    const election = this.currentElection;
    this.db.query(
      `INSERT INTO governance_elections (election_id, candidates, votes, voters, starts_at, ends_at, status, winner)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (election_id) DO UPDATE SET
         candidates = EXCLUDED.candidates,
         votes = EXCLUDED.votes,
         voters = EXCLUDED.voters,
         status = EXCLUDED.status,
         winner = EXCLUDED.winner`,
      [
        election.id,
        Array.from(election.candidates.values()),
        election.votes,
        Array.from(election.voters),
        election.startsAt,
        election.endsAt,
        status,
        winner
      ]
    ).catch((error) => logger.error('Election persist failed:', error));
  }

  persistPresident() {
    if (!this.db) return;
    this.db.query(
      `INSERT INTO governance_president (id, president)
       VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET president = EXCLUDED.president, updated_at = NOW()`,
      [this.currentPresident]
    ).catch((error) => logger.error('President persist failed:', error));
  }

  persistPolicy(policy, status) {
    if (!this.db) return;
    this.db.query(
      `INSERT INTO governance_policies (policy_id, policy, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (policy_id) DO UPDATE SET policy = EXCLUDED.policy, status = EXCLUDED.status`,
      [policy.id, policy, status]
    ).catch((error) => logger.error('Policy persist failed:', error));
  }

  createSnapshot() {
    return {
      currentPresident: this.currentPresident ? { ...this.currentPresident } : null,
      currentElection: this.currentElection
        ? {
            id: this.currentElection.id,
            candidates: Array.from(this.currentElection.candidates.values()),
            votes: { ...this.currentElection.votes },
            voters: Array.from(this.currentElection.voters),
            startsAt: this.currentElection.startsAt,
            endsAt: this.currentElection.endsAt
          }
        : null,
      noConfidence: this.noConfidence
        ? {
            id: this.noConfidence.id,
            targetPresident: this.noConfidence.targetPresident,
            initiatedBy: this.noConfidence.initiatedBy,
            startsAt: this.noConfidence.startsAt,
            endsAt: this.noConfidence.endsAt,
            status: this.noConfidence.status,
            expectedVoters: this.noConfidence.expectedVoters,
            votesFor: Array.from(this.noConfidence.votesFor),
            votesAgainst: Array.from(this.noConfidence.votesAgainst),
            result: this.noConfidence.result
          }
        : null,
      policies: this.policies.map((policy) => ({ ...policy }))
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot) return;

    this.currentPresident = snapshot.currentPresident ? { ...snapshot.currentPresident } : null;

    if (snapshot.currentElection) {
      const election = snapshot.currentElection;
      this.currentElection = {
        id: election.id,
        candidates: new Map((election.candidates || []).map((candidate) => [candidate.agentId, candidate])),
        votes: election.votes || {},
        voters: new Set(election.voters || []),
        startsAt: Number(election.startsAt),
        endsAt: Number(election.endsAt)
      };
    } else {
      this.currentElection = null;
    }

    if (snapshot.noConfidence) {
      const vote = snapshot.noConfidence;
      this.noConfidence = {
        id: vote.id,
        targetPresident: vote.targetPresident || null,
        initiatedBy: vote.initiatedBy || null,
        startsAt: Number(vote.startsAt),
        endsAt: Number(vote.endsAt),
        status: vote.status || 'open',
        expectedVoters: Number(vote.expectedVoters || 0),
        votesFor: new Set(vote.votesFor || []),
        votesAgainst: new Set(vote.votesAgainst || []),
        result: vote.result || null
      };
    } else {
      this.noConfidence = null;
    }

    this.policies = Array.isArray(snapshot.policies)
      ? snapshot.policies.map((policy) => ({ ...policy }))
      : [];
  }
}

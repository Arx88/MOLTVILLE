import { logger } from '../utils/logger.js';
import { BUILDING_CATALOG, filterCatalogByDistrict, getCatalogForPopulation } from './BuildingCatalog.js';

export class VotingManager {
  constructor(worldState, io, options = {}) {
    this.worldState = worldState;
    this.io = io;
    this.db = options.db || null;
    this.economyManager = options.economyManager || null;
    this.catalog = options.catalog || BUILDING_CATALOG;
    this.voteDurationMs = parseInt(process.env.BUILDING_VOTE_DURATION_MS, 10) || 86400000;
    this.voteOptionsCount = parseInt(process.env.BUILDING_VOTE_OPTIONS, 10) || 4;
    this.maxProposalsPerVote = parseInt(process.env.BUILDING_VOTE_PROPOSALS, 10) || 1;
    this.proposalTtlMs = parseInt(process.env.BUILDING_PROPOSAL_TTL_MS, 10) || 604800000;
    this.currentVote = null;
    this.pendingProposals = [];
    this.voteHistory = [];
  }

  async initializeFromDb() {
    if (!this.db) return;
    const result = await this.db.query(
      "SELECT * FROM vote_state WHERE status = 'open' ORDER BY starts_at DESC LIMIT 1"
    );
    if (!result.rows.length) return;
    const row = result.rows[0];
    this.currentVote = {
      id: row.vote_id,
      lotId: row.lot_id,
      options: row.options,
      votes: row.votes,
      voters: new Set(row.voters || []),
      startsAt: Number(row.starts_at),
      endsAt: Number(row.ends_at)
    };

    const proposals = await this.db.query(
      "SELECT * FROM vote_proposals WHERE status = 'pending' ORDER BY created_at ASC"
    );
    this.pendingProposals = proposals.rows.map(row => ({
      id: row.proposal_id,
      agentId: row.agent_id,
      templateId: row.template_id,
      name: row.name,
      type: row.type,
      district: row.district_id,
      createdAt: Number(row.created_at)
    }));
  }

  startVote() {
    if (this.currentVote) return this.currentVote;
    const availableLots = this.worldState.lots;
    if (!availableLots.length) {
      logger.info('Voting: no available lots for construction.');
      return null;
    }
    const lot = availableLots[Math.floor(Math.random() * availableLots.length)];
    const districtId = lot.district || 'central';
    const population = this.worldState.agents?.size || 0;
    const options = this.buildVoteOptions(districtId, population);
    const now = Date.now();
    this.currentVote = {
      id: `vote-${now}`,
      lotId: lot.id,
      options,
      votes: {},
      voters: new Set(),
      startsAt: now,
      endsAt: now + this.voteDurationMs
    };
    this.persistVote('open');
    this.io.emit('vote:started', this.getVoteSummary());
    logger.info(`Voting: started ${this.currentVote.id}`);
    return this.currentVote;
  }

  buildVoteOptions(districtId, population) {
    const proposals = this.consumeProposals(districtId);
    const baseCatalog = filterCatalogByDistrict(
      getCatalogForPopulation(population),
      districtId
    );
    const fallbackCatalog = this.catalog.length ? this.catalog : BUILDING_CATALOG;
    const pool = baseCatalog.length ? baseCatalog : fallbackCatalog;
    const options = proposals.map(proposal => ({
      id: proposal.id,
      name: proposal.name,
      type: proposal.type,
      source: 'proposal',
      templateId: proposal.templateId
    }));
    const usedIds = new Set(options.map(option => option.templateId || option.id));

    while (options.length < this.voteOptionsCount && pool.length) {
      const candidate = pool[Math.floor(Math.random() * pool.length)];
      if (usedIds.has(candidate.id)) continue;
      options.push({
        id: candidate.id,
        name: candidate.name,
        type: candidate.type,
        source: 'catalog',
        templateId: candidate.id
      });
      usedIds.add(candidate.id);
    }
    return options.slice(0, this.voteOptionsCount);
  }

  proposeBuilding({ agentId, templateId = null, customName = '', districtId = null, type = null }) {
    if (!agentId) throw new Error('Agent ID required');
    const sanitizedName = customName.trim();
    let resolvedType = type;
    let resolvedName = sanitizedName;
    let resolvedTemplateId = templateId;

    if (templateId) {
      const template = this.catalog.find(entry => entry.id === templateId);
      if (!template) throw new Error('Template not found');
      resolvedType = template.type;
      resolvedName = sanitizedName ? sanitizedName.slice(0, 60) : template.name;
    } else {
      if (!resolvedType) throw new Error('Building type required');
      if (!resolvedName) throw new Error('Custom name required');
      resolvedTemplateId = null;
      resolvedName = resolvedName.slice(0, 60);
    }
    const proposal = {
      id: `proposal-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      agentId,
      templateId: resolvedTemplateId,
      name: resolvedName,
      type: resolvedType,
      district: districtId,
      createdAt: Date.now()
    };
    this.pendingProposals.push(proposal);
    this.persistProposal(proposal);
    return proposal;
  }

  listCatalog() {
    return this.catalog;
  }

  consumeProposals(districtId) {
    const now = Date.now();
    const active = [];
    const expired = [];
    this.pendingProposals.forEach(proposal => {
      if (now - proposal.createdAt <= this.proposalTtlMs) {
        active.push(proposal);
      } else {
        expired.push(proposal);
      }
    });
    expired.forEach(proposal => this.persistProposalStatus(proposal.id, 'expired'));
    const [matching, others] = active.reduce(
      (acc, proposal) => {
        const target = !proposal.district || proposal.district === districtId ? acc[0] : acc[1];
        target.push(proposal);
        return acc;
      },
      [[], []]
    );
    const selected = matching.slice(0, this.maxProposalsPerVote);
    const selectedIds = new Set(selected.map(item => item.id));
    const remaining = [...matching.slice(this.maxProposalsPerVote), ...others].filter(item => !selectedIds.has(item.id));
    this.pendingProposals = remaining;
    selected.forEach(proposal => this.persistProposalStatus(proposal.id, 'used'));
    return selected;
  }

  castVote(agentId, optionId) {
    if (!this.currentVote) {
      throw new Error('No active vote');
    }
    if (this.currentVote.voters.has(agentId)) {
      throw new Error('Agent already voted');
    }
    const option = this.currentVote.options.find(item => item.id === optionId);
    if (!option) {
      throw new Error('Invalid option');
    }
    this.currentVote.voters.add(agentId);
    this.currentVote.votes[optionId] = (this.currentVote.votes[optionId] || 0) + 1;
    this.persistVote('open');
    return this.getVoteSummary();
  }

  tick() {
    if (!this.currentVote) {
      this.startVote();
      return;
    }
    if (Date.now() >= this.currentVote.endsAt) {
      this.closeVote();
      this.startVote();
    }
  }

  closeVote() {
    const vote = this.currentVote;
    if (!vote) return null;
    const winningOption = this.selectWinner(vote);
    const building = this.worldState.addBuildingFromLot({
      id: `building-${Date.now()}`,
      name: winningOption.name,
      type: winningOption.type,
      lotId: vote.lotId
    });
    if (this.economyManager) {
      this.economyManager.registerBuilding(building);
    }
    const result = {
      voteId: vote.id,
      lotId: vote.lotId,
      winner: winningOption,
      totalVotes: Object.values(vote.votes).reduce((sum, count) => sum + count, 0)
    };
    this.io.emit('vote:closed', result);
    this.io.emit('building:constructed', building);
    logger.info(`Voting: closed ${vote.id} winner ${winningOption.id}`);
    this.persistVote('closed', winningOption);
    this.trackHistory(result);
    this.currentVote = null;
    return result;
  }

  selectWinner(vote) {
    const tally = vote.options.map(option => ({
      ...option,
      votes: vote.votes[option.id] || 0
    }));
    tally.sort((a, b) => b.votes - a.votes);
    return tally[0] || vote.options[0];
  }

  getVoteSummary() {
    if (!this.currentVote) return null;
    return {
      id: this.currentVote.id,
      lotId: this.currentVote.lotId,
      options: this.currentVote.options.map(option => ({
        ...option,
        votes: this.currentVote.votes[option.id] || 0
      })),
      startsAt: this.currentVote.startsAt,
      endsAt: this.currentVote.endsAt
    };
  }

  trackHistory(result) {
    if (!result) return;
    const entry = {
      voteId: result.voteId,
      lotId: result.lotId,
      winner: result.winner,
      totalVotes: result.totalVotes,
      closedAt: Date.now()
    };
    this.voteHistory.unshift(entry);
    this.voteHistory = this.voteHistory.slice(0, 20);
  }

  async getVoteHistory(limit = 5) {
    if (!this.db) {
      return this.voteHistory.slice(0, limit);
    }
    const result = await this.db.query(
      "SELECT vote_id, lot_id, winner, ends_at FROM vote_state WHERE status = 'closed' ORDER BY ends_at DESC LIMIT $1",
      [limit]
    );
    return result.rows.map(row => ({
      voteId: row.vote_id,
      lotId: row.lot_id,
      winner: row.winner,
      closedAt: Number(row.ends_at)
    }));
  }

  persistProposal(proposal) {
    if (!this.db || !proposal) return;
    this.db.query(
      `INSERT INTO vote_proposals (proposal_id, agent_id, template_id, name, type, district_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       ON CONFLICT (proposal_id) DO NOTHING`,
      [
        proposal.id,
        proposal.agentId,
        proposal.templateId,
        proposal.name,
        proposal.type,
        proposal.district,
        proposal.createdAt
      ]
    ).catch(error => logger.error('Vote proposal persist failed:', error));
  }

  persistProposalStatus(proposalId, status) {
    if (!this.db || !proposalId) return;
    this.db.query(
      `UPDATE vote_proposals SET status = $2, used_at = NOW() WHERE proposal_id = $1`,
      [proposalId, status]
    ).catch(error => logger.error('Vote proposal update failed:', error));
  }

  persistVote(status, winner = null) {
    if (!this.db || !this.currentVote) return;
    const vote = this.currentVote;
    this.db.query(
      `INSERT INTO vote_state (vote_id, lot_id, options, votes, voters, starts_at, ends_at, status, winner)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (vote_id) DO UPDATE SET
         options = EXCLUDED.options,
         votes = EXCLUDED.votes,
         voters = EXCLUDED.voters,
         status = EXCLUDED.status,
         winner = EXCLUDED.winner`,
      [
        vote.id,
        vote.lotId,
        vote.options,
        vote.votes,
        Array.from(vote.voters),
        vote.startsAt,
        vote.endsAt,
        status,
        winner
      ]
    ).catch(error => logger.error('Vote persist failed:', error));
  }

  createSnapshot() {
    return {
      currentVote: this.currentVote
        ? {
            id: this.currentVote.id,
            lotId: this.currentVote.lotId,
            options: this.currentVote.options.map(option => ({ ...option })),
            votes: { ...this.currentVote.votes },
            voters: Array.from(this.currentVote.voters),
            startsAt: this.currentVote.startsAt,
            endsAt: this.currentVote.endsAt
          }
        : null,
      pendingProposals: this.pendingProposals.map(proposal => ({ ...proposal })),
      voteHistory: this.voteHistory.map(entry => ({ ...entry }))
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot) return;
    if (snapshot.currentVote) {
      const vote = snapshot.currentVote;
      this.currentVote = {
        id: vote.id,
        lotId: vote.lotId,
        options: (vote.options || []).map(option => ({ ...option })),
        votes: vote.votes || {},
        voters: new Set(vote.voters || []),
        startsAt: Number(vote.startsAt),
        endsAt: Number(vote.endsAt)
      };
    } else {
      this.currentVote = null;
    }
    this.pendingProposals = Array.isArray(snapshot.pendingProposals)
      ? snapshot.pendingProposals.map(proposal => ({ ...proposal }))
      : [];
    this.voteHistory = Array.isArray(snapshot.voteHistory)
      ? snapshot.voteHistory.map(entry => ({ ...entry }))
      : [];
  }
}

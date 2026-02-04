import { logger } from '../utils/logger.js';

export class VotingManager {
  constructor(worldState, io, options = {}) {
    this.worldState = worldState;
    this.io = io;
    this.db = options.db || null;
    this.economyManager = options.economyManager || null;
    this.voteDurationMs = parseInt(process.env.BUILDING_VOTE_DURATION_MS, 10) || 86400000;
    this.currentVote = null;
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
  }

  startVote() {
    if (this.currentVote) return this.currentVote;
    const availableLots = this.worldState.lots;
    if (!availableLots.length) {
      logger.info('Voting: no available lots for construction.');
      return null;
    }
    const lot = availableLots[Math.floor(Math.random() * availableLots.length)];
    const options = [
      { id: 'cafe', name: 'Nuevo Café', type: 'cafe' },
      { id: 'library', name: 'Biblioteca Vecinal', type: 'library' },
      { id: 'market', name: 'Mercado Local', type: 'market' },
      { id: 'gallery', name: 'Galería Cultural', type: 'gallery' }
    ];
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
}

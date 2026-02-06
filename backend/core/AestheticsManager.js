import { logger } from '../utils/logger.js';

const DEFAULT_THEMES = [
  { id: 'classic', name: 'Clásico' },
  { id: 'verdant', name: 'Verde Urbano' },
  { id: 'coastal', name: 'Costero' },
  { id: 'industrial', name: 'Industrial' },
  { id: 'nocturnal', name: 'Nocturno' }
];

export class AestheticsManager {
  constructor({ worldStateManager, economyManager = null, governanceManager = null, io = null }) {
    this.worldState = worldStateManager;
    this.economy = economyManager;
    this.governance = governanceManager;
    this.io = io;
    this.themes = DEFAULT_THEMES;
    this.currentVote = null;
    this.voteDurationMs = parseInt(process.env.AESTHETIC_VOTE_DURATION_MS, 10) || 6 * 60 * 60 * 1000;
    this.cooldownMs = parseInt(process.env.AESTHETIC_COOLDOWN_MS, 10) || 2 * 24 * 60 * 60 * 1000;
    this.voteCost = parseFloat(process.env.AESTHETIC_VOTE_COST || '1');
    this.minVotes = parseInt(process.env.AESTHETIC_MIN_VOTES, 10) || 3;
    this.quorumRatio = parseFloat(process.env.AESTHETIC_QUORUM_RATIO || '0.15');
    this.history = [];
    this.historyLimit = parseInt(process.env.AESTHETIC_HISTORY_LIMIT, 10) || 10;
  }

  tick(population) {
    if (this.currentVote) {
      if (Date.now() >= this.currentVote.endsAt) {
        this.closeVote(population);
      }
      return;
    }

    const district = this.getEligibleDistrict();
    if (!district) return;
    this.openVote(district, population);
  }

  getEligibleDistrict() {
    const now = Date.now();
    const eligible = this.worldState.districts.filter(district => district.unlocked);
    const ready = eligible.filter(district => now - (district.lastThemeChange || 0) >= this.cooldownMs);
    if (!ready.length) return null;
    return ready.sort((a, b) => (a.lastThemeChange || 0) - (b.lastThemeChange || 0))[0];
  }

  openVote(district, population) {
    const options = this.pickThemeOptions(district.theme);
    if (!options.length) return;
    const now = Date.now();
    const vote = {
      id: `style-vote-${district.id}-${now}`,
      districtId: district.id,
      districtName: district.name,
      options: options.map(option => ({ ...option, votes: 0 })),
      votes: {},
      voters: new Set(),
      startsAt: now,
      endsAt: now + this.voteDurationMs,
      minVotes: this.minVotes,
      quorum: Math.max(this.minVotes, Math.ceil(population * this.quorumRatio)),
      voteCost: this.getVoteCost()
    };
    this.currentVote = vote;
    if (this.io) {
      this.io.emit('aesthetics:vote_started', this.getVoteSummary());
    }
  }

  pickThemeOptions(currentTheme) {
    const candidates = this.themes.filter(theme => theme.id !== currentTheme);
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }

  getVoteCost() {
    if (this.governance?.hasActivePolicy('urban_design_program')) {
      return Math.max(0, this.voteCost - 1);
    }
    return this.voteCost;
  }

  castVote({ agentId, optionId }) {
    if (!this.currentVote) {
      throw new Error('No hay votación estética activa.');
    }
    if (Date.now() >= this.currentVote.endsAt) {
      throw new Error('La votación estética ya terminó.');
    }
    if (this.currentVote.voters.has(agentId)) {
      throw new Error('Ya has votado en esta propuesta.');
    }
    const option = this.currentVote.options.find(opt => opt.id === optionId);
    if (!option) {
      throw new Error('Opción inválida.');
    }

    const fee = this.currentVote.voteCost;
    if (this.economy && fee > 0) {
      this.economy.decrementBalance(agentId, fee, `Aesthetic vote (${this.currentVote.districtId})`);
    }

    option.votes += 1;
    this.currentVote.voters.add(agentId);
    this.currentVote.votes[agentId] = optionId;
    return this.getVoteSummary();
  }

  closeVote(population) {
    if (!this.currentVote) return null;
    const vote = this.currentVote;
    this.currentVote = null;
    const totalVotes = vote.options.reduce((sum, option) => sum + option.votes, 0);
    const quorum = Math.max(vote.minVotes, Math.ceil(population * this.quorumRatio));
    const winner = totalVotes >= quorum
      ? vote.options.reduce((best, option) => (option.votes > best.votes ? option : best), vote.options[0])
      : null;

    if (winner) {
      this.worldState.setDistrictTheme(vote.districtId, winner.id);
      logger.info(`District theme updated: ${vote.districtId} -> ${winner.id}`);
      this.recordHistory({ ...vote, totalVotes, winner });
      if (this.io) {
        this.io.emit('aesthetics:theme_applied', { districtId: vote.districtId, theme: winner.id });
      }
    } else {
      logger.info(`Aesthetic vote failed quorum (${totalVotes}/${quorum}).`);
    }

    if (this.io) {
      this.io.emit('aesthetics:vote_closed', { ...vote, totalVotes, winner });
    }

    return { ...vote, totalVotes, winner };
  }

  getVoteSummary() {
    if (!this.currentVote) return null;
    return {
      id: this.currentVote.id,
      districtId: this.currentVote.districtId,
      districtName: this.currentVote.districtName,
      options: this.currentVote.options.map(option => ({ id: option.id, name: option.name, votes: option.votes })),
      startsAt: this.currentVote.startsAt,
      endsAt: this.currentVote.endsAt,
      minVotes: this.currentVote.minVotes,
      quorum: this.currentVote.quorum,
      voteCost: this.currentVote.voteCost
    };
  }

  getMeta() {
    return {
      voteDurationMs: this.voteDurationMs,
      cooldownMs: this.cooldownMs,
      voteCost: this.voteCost,
      minVotes: this.minVotes,
      quorumRatio: this.quorumRatio,
      themes: this.themes
    };
  }

  recordHistory(entry) {
    this.history.unshift({
      districtId: entry.districtId,
      districtName: entry.districtName,
      winner: entry.winner,
      totalVotes: entry.totalVotes,
      endsAt: entry.endsAt
    });
    if (this.history.length > this.historyLimit) {
      this.history.length = this.historyLimit;
    }
  }

  getHistory(limit = this.historyLimit) {
    return this.history.slice(0, limit);
  }

  createSnapshot() {
    return {
      currentVote: this.currentVote
        ? {
            ...this.currentVote,
            voters: Array.from(this.currentVote.voters || [])
          }
        : null,
      history: this.history.map(entry => ({ ...entry }))
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot) return;
    if (snapshot.currentVote) {
      const voters = new Set(snapshot.currentVote.voters || []);
      this.currentVote = {
        ...snapshot.currentVote,
        voters
      };
    } else {
      this.currentVote = null;
    }
    this.history = Array.isArray(snapshot.history)
      ? snapshot.history.map(entry => ({ ...entry }))
      : [];
  }
}

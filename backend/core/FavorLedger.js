import { logger } from '../utils/logger.js';

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round2 = (value) => Number((Number(value) || 0).toFixed(2));

export class FavorLedger {
  constructor() {
    this.entries = [];
    this.defaultDueMs = parseInt(process.env.FAVOR_DEFAULT_DUE_MS || `${3 * 24 * 60 * 60 * 1000}`, 10);
    this.interestIntervalMs = parseInt(process.env.FAVOR_INTEREST_INTERVAL_MS || `${6 * 60 * 60 * 1000}`, 10);
    this.interestRate = toNumber(process.env.FAVOR_INTEREST_RATE, 0.045);
    this.penaltyIntervalMs = parseInt(process.env.FAVOR_PENALTY_INTERVAL_MS || `${45 * 60 * 1000}`, 10);
    this.maxEntries = parseInt(process.env.FAVOR_LEDGER_MAX_ENTRIES || '5000', 10);
    this.negotiationBlockRatio = toNumber(process.env.FAVOR_NEGOTIATION_BLOCK_RATIO, 0.55);
  }

  pruneIfNeeded() {
    if (this.entries.length <= this.maxEntries) return;
    this.entries.splice(0, this.entries.length - this.maxEntries);
  }

  createFavor({ from, to, value = 1, reason = '', dueAt = null, dueInMs = null }) {
    if (!from || !to || from === to) {
      throw new Error('Invalid favor participants');
    }

    const now = Date.now();
    const dueTimestamp = Number.isFinite(Number(dueAt))
      ? Number(dueAt)
      : now + toNumber(dueInMs, this.defaultDueMs);

    const entry = {
      id: `favor-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      from,
      to,
      value: round2(Math.max(0.1, Number(value) || 1)),
      originalValue: round2(Math.max(0.1, Number(value) || 1)),
      reason,
      status: 'open',
      createdAt: now,
      dueAt: dueTimestamp,
      settledAt: null,
      lastInterestAt: now,
      lastPenaltyAt: 0,
      isPublicDefault: false,
      history: []
    };

    this.entries.push(entry);
    this.pruneIfNeeded();
    logger.info(`Favor created: ${from} -> ${to} (${entry.value})`);
    return entry;
  }

  repayFavor({ from, to, value = 1 }) {
    const open = this.entries
      .filter((entry) => entry.status === 'open' && entry.from === from && entry.to === to)
      .sort((a, b) => a.createdAt - b.createdAt);

    if (!open.length) {
      throw new Error('No open favors to repay');
    }

    let remaining = round2(Math.max(0, Number(value) || 0));
    if (remaining <= 0) {
      throw new Error('Repay value must be > 0');
    }

    open.forEach((entry) => {
      if (remaining <= 0) return;
      const payable = Math.min(entry.value, remaining);
      entry.value = round2(entry.value - payable);
      entry.history.push({
        type: 'repayment',
        amount: payable,
        timestamp: Date.now()
      });
      remaining = round2(remaining - payable);

      if (entry.value <= 0) {
        entry.value = 0;
        entry.status = 'settled';
        entry.settledAt = Date.now();
      }
    });

    logger.info(`Favor repaid: ${from} -> ${to} (${value})`);
    return { success: true, remaining }; 
  }

  transferFavor({ favorId, newCreditor, byAgentId = null }) {
    const entry = this.entries.find((candidate) => candidate.id === favorId);
    if (!entry) {
      throw new Error('Favor not found');
    }
    if (entry.status !== 'open') {
      throw new Error('Only open favors can be transferred');
    }
    if (!newCreditor || newCreditor === entry.from) {
      throw new Error('Invalid new creditor');
    }
    if (byAgentId && byAgentId !== entry.to) {
      throw new Error('Only current creditor can transfer favor');
    }

    const previousCreditor = entry.to;
    entry.to = newCreditor;
    entry.history.push({
      type: 'transfer',
      from: previousCreditor,
      to: newCreditor,
      timestamp: Date.now()
    });

    logger.info(`Favor transferred: ${entry.id} ${previousCreditor} -> ${newCreditor}`);
    return entry;
  }

  applyInterest(entry, now) {
    if (!entry || entry.status !== 'open') return false;
    if (!Number.isFinite(entry.dueAt) || now <= entry.dueAt) {
      entry.lastInterestAt = now;
      return false;
    }

    let updated = false;
    let cursor = Number(entry.lastInterestAt || entry.dueAt);
    while (now - cursor >= this.interestIntervalMs) {
      cursor += this.interestIntervalMs;
      entry.value = round2(entry.value * (1 + this.interestRate));
      updated = true;
      entry.history.push({
        type: 'interest',
        rate: this.interestRate,
        value: entry.value,
        timestamp: cursor
      });
    }

    entry.lastInterestAt = cursor;
    return updated;
  }

  applyOverduePenalty(entry, { reputationManager, moltbotRegistry, now }) {
    if (!entry || entry.status !== 'open') return null;
    if (!Number.isFinite(entry.dueAt) || now <= entry.dueAt) return null;
    if (entry.lastPenaltyAt && now - entry.lastPenaltyAt < this.penaltyIntervalMs) return null;

    const overdueHours = Math.max(1, (now - entry.dueAt) / (60 * 60 * 1000));
    const severity = Math.min(3.5, 0.8 + (overdueHours / 48));
    entry.lastPenaltyAt = now;
    entry.isPublicDefault = true;
    entry.history.push({
      type: 'penalty',
      severity,
      timestamp: now
    });

    if (reputationManager) {
      reputationManager.adjust(entry.from, -severity, {
        reason: 'favor_default_overdue',
        favorId: entry.id,
        creditor: entry.to,
        overdueHours: Number(overdueHours.toFixed(2))
      });
      reputationManager.adjust(entry.to, 0.15, {
        reason: 'favor_creditor_patience',
        favorId: entry.id
      });
    }

    if (moltbotRegistry) {
      moltbotRegistry.updateRelationship(entry.from, entry.to, -6, { trust: -8, respect: -2, conflict: 4 });
      moltbotRegistry.updateRelationship(entry.to, entry.from, -3, { trust: -5, respect: -1, conflict: 2 });
    }

    return {
      favorId: entry.id,
      debtor: entry.from,
      creditor: entry.to,
      severity: Number(severity.toFixed(2)),
      overdueHours: Number(overdueHours.toFixed(2)),
      value: entry.value
    };
  }

  applyTick({ reputationManager = null, moltbotRegistry = null, now = Date.now() } = {}) {
    const penalties = [];
    let interestUpdated = 0;
    let overdueOpen = 0;
    let overdueValue = 0;

    this.entries.forEach((entry) => {
      if (entry.status !== 'open') return;
      if (Number.isFinite(entry.dueAt) && now > entry.dueAt) {
        overdueOpen += 1;
        overdueValue += Number(entry.value || 0);
      }
      if (this.applyInterest(entry, now)) {
        interestUpdated += 1;
      }
      const penalty = this.applyOverduePenalty(entry, { reputationManager, moltbotRegistry, now });
      if (penalty) {
        penalties.push(penalty);
      }
    });

    return {
      processed: this.entries.length,
      open: this.entries.filter((entry) => entry.status === 'open').length,
      overdueOpen,
      overdueValue: round2(overdueValue),
      penalties,
      interestUpdated
    };
  }

  getBalance(agentId) {
    let owed = 0;
    let owing = 0;

    this.entries.forEach((entry) => {
      if (entry.status !== 'open') return;
      if (entry.to === agentId) owed += Number(entry.value || 0);
      if (entry.from === agentId) owing += Number(entry.value || 0);
    });

    owed = round2(owed);
    owing = round2(owing);
    return { owed, owing, net: round2(owed - owing) };
  }

  getSummary(agentId) {
    const balance = this.getBalance(agentId);
    const scoped = this.entries.filter((entry) => entry.from === agentId || entry.to === agentId);
    const openEntries = scoped.filter((entry) => entry.status === 'open');
    const now = Date.now();
    const overdueEntries = openEntries.filter((entry) => Number.isFinite(entry.dueAt) && entry.dueAt <= now);
    return {
      ...balance,
      openCount: openEntries.length,
      overdueCount: overdueEntries.length,
      overdueValue: round2(overdueEntries.reduce((sum, entry) => sum + Number(entry.value || 0), 0))
    };
  }

  getRiskProfile(agentId) {
    const scoped = this.entries.filter((entry) => entry.from === agentId || entry.to === agentId);
    const openAsDebtor = scoped.filter((entry) => entry.status === 'open' && entry.from === agentId);
    const now = Date.now();
    const overdueAsDebtor = openAsDebtor.filter((entry) => Number.isFinite(entry.dueAt) && entry.dueAt < now);
    const totalOpen = openAsDebtor.length;
    const overdueRatio = totalOpen > 0 ? overdueAsDebtor.length / totalOpen : 0;

    return {
      agentId,
      openDebts: totalOpen,
      overdueDebts: overdueAsDebtor.length,
      overdueRatio: Number(overdueRatio.toFixed(3)),
      overdueValue: round2(overdueAsDebtor.reduce((sum, entry) => sum + Number(entry.value || 0), 0)),
      isNegotiationBlocked: overdueRatio >= this.negotiationBlockRatio && overdueAsDebtor.length > 0
    };
  }

  canNegotiate(agentId) {
    const profile = this.getRiskProfile(agentId);
    if (profile.isNegotiationBlocked) {
      return {
        allowed: false,
        reason: 'favor_default_risk',
        profile
      };
    }

    return {
      allowed: true,
      reason: 'ok',
      profile
    };
  }

  listForAgent(agentId) {
    return this.entries.filter((entry) => entry.from === agentId || entry.to === agentId);
  }

  listOverdue(agentId = null) {
    const now = Date.now();
    return this.entries.filter((entry) => {
      if (entry.status !== 'open') return false;
      if (!Number.isFinite(entry.dueAt) || entry.dueAt > now) return false;
      if (!agentId) return true;
      return entry.from === agentId || entry.to === agentId;
    });
  }
}

import { logger } from '../utils/logger.js';

export class FavorLedger {
  constructor() {
    this.entries = []; // { id, from, to, value, reason, status, createdAt, settledAt }
  }

  createFavor({ from, to, value = 1, reason = '' }) {
    if (!from || !to || from === to) {
      throw new Error('Invalid favor participants');
    }
    const entry = {
      id: `favor-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      from,
      to,
      value: Number(value) || 1,
      reason,
      status: 'open',
      createdAt: Date.now(),
      settledAt: null
    };
    this.entries.push(entry);
    logger.info(`Favor created: ${from} -> ${to} (${entry.value})`);
    return entry;
  }

  repayFavor({ from, to, value = 1, reason = '' }) {
    const open = this.entries.filter(e => e.status === 'open' && e.from === from && e.to === to);
    if (!open.length) {
      throw new Error('No open favors to repay');
    }
    let remaining = Number(value) || 1;
    open.forEach(entry => {
      if (remaining <= 0) return;
      if (entry.value <= remaining) {
        entry.status = 'settled';
        entry.settledAt = Date.now();
        remaining -= entry.value;
      } else {
        entry.value -= remaining;
        remaining = 0;
      }
    });
    logger.info(`Favor repaid: ${from} -> ${to} (${value})`);
    return { success: true };
  }

  getBalance(agentId) {
    let owed = 0;
    let owing = 0;
    this.entries.forEach(entry => {
      if (entry.status !== 'open') return;
      if (entry.to === agentId) owed += entry.value;
      if (entry.from === agentId) owing += entry.value;
    });
    return { owed, owing, net: owed - owing };
  }

  getSummary(agentId) {
    const balance = this.getBalance(agentId);
    const openCount = this.entries.filter(e => e.status === 'open' && (e.from === agentId || e.to === agentId)).length;
    return { ...balance, openCount };
  }

  listForAgent(agentId) {
    return this.entries.filter(e => e.from === agentId || e.to === agentId);
  }
}

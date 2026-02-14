import { logger } from '../utils/logger.js';

export class NegotiationService {
  constructor({ favorLedger, reputationManager }) {
    this.favorLedger = favorLedger;
    this.reputationManager = reputationManager;
    this.negotiations = new Map();
  }

  assertNegotiationAllowed(agentId) {
    if (!this.favorLedger || !agentId) return;
    const result = this.favorLedger.canNegotiate(agentId);
    if (!result.allowed) {
      throw new Error(`Negotiation blocked for ${agentId}: ${result.reason}`);
    }
  }

  propose({ from, to, ask, offer, reason = '' }) {
    if (!from || !to || from === to) {
      throw new Error('Invalid negotiation participants');
    }

    this.assertNegotiationAllowed(from);

    const negotiation = {
      id: `neg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      from,
      to,
      ask,
      offer,
      reason,
      status: 'proposed',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.negotiations.set(negotiation.id, negotiation);
    logger.info(`Negotiation proposed: ${from} -> ${to}`);
    return negotiation;
  }

  counter(id, { ask, offer }) {
    const negotiation = this.negotiations.get(id);
    if (!negotiation) {
      throw new Error('Negotiation not found');
    }

    this.assertNegotiationAllowed(negotiation.from);

    negotiation.ask = ask || negotiation.ask;
    negotiation.offer = offer || negotiation.offer;
    negotiation.status = 'countered';
    negotiation.updatedAt = Date.now();
    return negotiation;
  }

  accept(id) {
    const negotiation = this.negotiations.get(id);
    if (!negotiation) {
      throw new Error('Negotiation not found');
    }

    this.assertNegotiationAllowed(negotiation.from);

    negotiation.status = 'accepted';
    negotiation.updatedAt = Date.now();
    this._finalize(negotiation);
    return negotiation;
  }

  _finalize(negotiation) {
    const { from, to, offer } = negotiation;

    if (offer?.type === 'favor') {
      this.favorLedger.createFavor({
        from,
        to,
        value: offer.value || 1,
        reason: offer.reason || 'negotiation',
        dueAt: offer.dueAt,
        dueInMs: offer.dueInMs
      });
    }

    this.reputationManager.adjust(from, 1, { reason: 'negotiation_success' });
    this.reputationManager.adjust(to, 1, { reason: 'negotiation_success' });
  }

  listForAgent(agentId) {
    return Array.from(this.negotiations.values())
      .filter((negotiation) => negotiation.from === agentId || negotiation.to === agentId);
  }
}

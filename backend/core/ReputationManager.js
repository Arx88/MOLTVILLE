import { logger } from '../utils/logger.js';

export class ReputationManager {
  constructor() {
    this.reputation = new Map(); // agentId -> { global, districts, roles, lastUpdated }
  }

  ensure(agentId) {
    if (!this.reputation.has(agentId)) {
      this.reputation.set(agentId, {
        global: 0,
        districts: {},
        roles: {},
        lastUpdated: Date.now()
      });
    }
    return this.reputation.get(agentId);
  }

  adjust(agentId, delta = 0, context = {}) {
    const rep = this.ensure(agentId);
    rep.global += delta;
    const district = context.districtId;
    const role = context.role;
    if (district) rep.districts[district] = (rep.districts[district] || 0) + delta;
    if (role) rep.roles[role] = (rep.roles[role] || 0) + delta;
    rep.lastUpdated = Date.now();
    logger.info(`Reputation updated: ${agentId} (${delta})`);
    return rep;
  }

  getSnapshot(agentId) {
    const rep = this.ensure(agentId);
    return { ...rep, districts: { ...rep.districts }, roles: { ...rep.roles } };
  }
}

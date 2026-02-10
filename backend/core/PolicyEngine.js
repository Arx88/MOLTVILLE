export class PolicyEngine {
  constructor({ governanceManager, economyManager }) {
    this.governanceManager = governanceManager;
    this.economyManager = economyManager;
  }

  applyActivePolicies() {
    const summary = this.governanceManager.getSummary();
    const policies = summary?.policies || [];
    this.economyManager.applyPolicies(policies);
    return policies;
  }
}

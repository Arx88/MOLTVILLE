export class EconomyService {
  constructor({ economyManager }) {
    this.economyManager = economyManager;
  }

  getViewerSummary() {
    return {
      inventorySummary: this.economyManager.getInventoryStats(),
      itemTransactionCount: this.economyManager.getItemTransactions(500).length
    };
  }
}

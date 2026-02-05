import { logger } from '../utils/logger.js';

export class EconomyManager {
  constructor(worldState, options = {}) {
    this.worldState = worldState;
    this.db = options.db || null;
    this.io = options.io || null;
    this.balances = new Map();
    this.jobs = new Map();
    this.jobAssignments = new Map();
    this.reviews = new Map();
    this.properties = new Map();
    this.transactions = new Map();
    this.inventories = new Map();
    this.itemTransactions = [];
    this.itemTransactionsByAgent = new Map();
    this.policyState = {
      baseIncomeMultiplier: 1,
      salaryMultiplier: 1,
      taxRate: 0,
      housingTaxRate: 0
    };
    this.lastIncomeAt = Date.now();
    this.incomeIntervalMs = parseInt(process.env.INCOME_INTERVAL_MS, 10) || 60000;
    this.baseIncome = parseFloat(process.env.BASE_INCOME || '2');
    this.reviewThreshold = parseFloat(process.env.REVIEW_THRESHOLD || '2.5');
    this.jobTemplates = this.initializeJobTemplates();
    this.initializeJobs();
    this.initializeProperties();
  }

  async initializeFromDb() {
    if (!this.db) return;
    const balances = await this.db.query('SELECT agent_id, balance FROM economy_balances');
    balances.rows.forEach(row => {
      this.balances.set(row.agent_id, parseFloat(row.balance));
    });

    const properties = await this.db.query('SELECT * FROM economy_properties');
    if (properties.rows.length) {
      this.properties.clear();
      properties.rows.forEach(row => {
        this.properties.set(row.property_id, {
          id: row.property_id,
          name: row.name,
          type: row.type,
          buildingId: row.building_id,
          price: parseFloat(row.price),
          ownerId: row.owner_id,
          forSale: row.for_sale
        });
      });
    } else {
      this.persistProperties();
    }
  }

  initializeJobTemplates() {
    return {
      cafe: [
        { role: 'Barista', salary: 8 },
        { role: 'Host', salary: 6 }
      ],
      bakery: [
        { role: 'Baker', salary: 7 },
        { role: 'Cashier', salary: 5 }
      ],
      restaurant: [
        { role: 'Chef', salary: 10 },
        { role: 'Server', salary: 7 }
      ],
      bar: [
        { role: 'Bartender', salary: 8 },
        { role: 'Host', salary: 6 }
      ],
      library: [
        { role: 'Librarian', salary: 7 },
        { role: 'Mentor', salary: 5 }
      ],
      school: [
        { role: 'Teacher', salary: 8 },
        { role: 'Counselor', salary: 6 }
      ],
      clinic: [
        { role: 'Nurse', salary: 8 },
        { role: 'Receptionist', salary: 5 }
      ],
      hospital: [
        { role: 'Doctor', salary: 12 },
        { role: 'Nurse', salary: 8 }
      ],
      shop: [
        { role: 'Clerk', salary: 6 }
      ],
      market: [
        { role: 'Vendor', salary: 7 }
      ],
      gallery: [
        { role: 'Curator', salary: 7 },
        { role: 'Guide', salary: 5 }
      ],
      theater: [
        { role: 'Stage Manager', salary: 8 },
        { role: 'Performer', salary: 7 }
      ],
      museum: [
        { role: 'Archivist', salary: 7 },
        { role: 'Guide', salary: 6 }
      ],
      park: [
        { role: 'Gardener', salary: 5 }
      ],
      garden: [
        { role: 'Gardener', salary: 5 }
      ],
      gym: [
        { role: 'Coach', salary: 7 },
        { role: 'Trainer', salary: 6 }
      ],
      factory: [
        { role: 'Operator', salary: 8 },
        { role: 'Mechanic', salary: 7 }
      ],
      workshop: [
        { role: 'Craftsperson', salary: 7 }
      ],
      lab: [
        { role: 'Researcher', salary: 9 },
        { role: 'Lab Assistant', salary: 6 }
      ],
      office: [
        { role: 'Analyst', salary: 8 },
        { role: 'Coordinator', salary: 7 }
      ],
      bank: [
        { role: 'Teller', salary: 8 },
        { role: 'Advisor', salary: 9 }
      ],
      hotel: [
        { role: 'Receptionist', salary: 7 },
        { role: 'Housekeeping', salary: 5 }
      ]
    };
  }

  initializeJobs() {
    this.worldState.buildings.forEach(building => {
      this.addJobsForBuilding(building);
    });
  }

  initializeProperties() {
    this.worldState.buildings.forEach(building => {
      this.addPropertyForBuilding(building);
    });
  }

  registerAgent(agentId) {
    if (!this.balances.has(agentId)) {
      this.balances.set(agentId, parseFloat(process.env.STARTING_BALANCE || '10'));
      this.transactions.set(agentId, []);
      this.persistBalance(agentId);
      logger.info(`Economy: Initialized balance for agent ${agentId}`);
    }
    if (!this.inventories.has(agentId)) {
      this.inventories.set(agentId, new Map());
    }
  }

  ensureInventory(agentId) {
    if (!this.inventories.has(agentId)) {
      this.inventories.set(agentId, new Map());
    }
    return this.inventories.get(agentId);
  }

  getInventory(agentId) {
    const inventory = this.ensureInventory(agentId);
    return Array.from(inventory.values()).map(item => ({ ...item }));
  }

  addItem(agentId, { itemId, name, quantity = 1 }) {
    if (!itemId) {
      throw new Error('itemId is required');
    }
    const numericQuantity = Number(quantity);
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      throw new Error('quantity must be a positive number');
    }
    const inventory = this.ensureInventory(agentId);
    const existing = inventory.get(itemId);
    const nextName = name || existing?.name || itemId;
    const nextQuantity = (existing?.quantity || 0) + numericQuantity;
    const item = { id: itemId, name: nextName, quantity: nextQuantity };
    inventory.set(itemId, item);
    this.recordItemTransaction({
      agentId,
      itemId,
      name: nextName,
      quantity: numericQuantity,
      action: 'add'
    });
    this.emitInventoryUpdate(agentId);
    return item;
  }

  removeItem(agentId, { itemId, quantity = 1 }) {
    if (!itemId) {
      throw new Error('itemId is required');
    }
    const numericQuantity = Number(quantity);
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      throw new Error('quantity must be a positive number');
    }
    const inventory = this.ensureInventory(agentId);
    const existing = inventory.get(itemId);
    if (!existing || existing.quantity < numericQuantity) {
      throw new Error('insufficient item quantity');
    }
    const nextQuantity = existing.quantity - numericQuantity;
    if (nextQuantity === 0) {
      inventory.delete(itemId);
      this.recordItemTransaction({
        agentId,
        itemId,
        name: existing.name,
        quantity: numericQuantity,
        action: 'remove'
      });
      this.emitInventoryUpdate(agentId);
      return { id: itemId, name: existing.name, quantity: 0 };
    }
    const item = { id: itemId, name: existing.name, quantity: nextQuantity };
    inventory.set(itemId, item);
    this.recordItemTransaction({
      agentId,
      itemId,
      name: existing.name,
      quantity: numericQuantity,
      action: 'remove'
    });
    this.emitInventoryUpdate(agentId);
    return item;
  }

  recordItemTransaction({ agentId, itemId, name, quantity, action }) {
    const transaction = {
      agentId,
      itemId,
      name,
      quantity,
      action,
      timestamp: Date.now()
    };
    this.itemTransactions.push(transaction);
    if (this.itemTransactions.length > 500) {
      this.itemTransactions.splice(0, this.itemTransactions.length - 500);
    }
    if (!this.itemTransactionsByAgent.has(agentId)) {
      this.itemTransactionsByAgent.set(agentId, []);
    }
    const agentLedger = this.itemTransactionsByAgent.get(agentId);
    agentLedger.push(transaction);
    if (agentLedger.length > 200) {
      agentLedger.splice(0, agentLedger.length - 200);
    }
    if (this.io) {
      this.io.to('viewers').emit('economy:item-transaction', transaction);
    }
  }

  getItemTransactions(limit = 100) {
    return this.itemTransactions.slice(-limit);
  }

  getItemTransactionsForAgent(agentId, limit = 100) {
    if (!this.itemTransactionsByAgent.has(agentId)) return [];
    return this.itemTransactionsByAgent.get(agentId).slice(-limit);
  }

  getAllInventories() {
    const entries = [];
    this.inventories.forEach((inventory, agentId) => {
      entries.push({
        agentId,
        inventory: Array.from(inventory.values()).map(item => ({ ...item }))
      });
    });
    return entries;
  }

  emitInventoryUpdate(agentId) {
    if (!this.io) return;
    this.io.to('viewers').emit('economy:inventory:update', {
      agentId,
      inventory: this.getInventory(agentId)
    });
  }

  getBalance(agentId) {
    return this.balances.get(agentId) ?? 0;
  }

  getAverageBalance() {
    if (this.balances.size === 0) return 0;
    const total = Array.from(this.balances.values()).reduce((sum, value) => sum + value, 0);
    return total / this.balances.size;
  }

  getInventoryStats() {
    let totalItems = 0;
    const uniqueItems = new Set();
    this.inventories.forEach(inventory => {
      inventory.forEach(item => {
        totalItems += item.quantity || 0;
        if (item.id) uniqueItems.add(item.id);
      });
    });
    return {
      agentsWithInventory: this.inventories.size,
      totalItems,
      uniqueItems: uniqueItems.size
    };
  }

  tick() {
    const now = Date.now();
    if (now - this.lastIncomeAt < this.incomeIntervalMs) return;
    this.lastIncomeAt = now;

    for (const agentId of this.balances.keys()) {
      const baseIncome = this.baseIncome * this.policyState.baseIncomeMultiplier;
      const incomeTotal = [];
      incomeTotal.push({ amount: baseIncome, reason: 'base_income' });
      const jobId = this.jobAssignments.get(agentId);
      if (jobId) {
        const job = this.jobs.get(jobId);
        if (job) {
          incomeTotal.push({
            amount: job.salary * this.policyState.salaryMultiplier,
            reason: 'job_salary'
          });
        }
      }

      const gross = incomeTotal.reduce((sum, item) => sum + item.amount, 0);
      incomeTotal.forEach(item => this.incrementBalance(agentId, item.amount, item.reason));

      if (this.policyState.taxRate > 0 && gross > 0) {
        const taxAmount = gross * this.policyState.taxRate;
        this.decrementBalance(agentId, taxAmount, 'tax_withholding');
      }

      if (this.policyState.housingTaxRate > 0) {
        const ownedProperties = this.getPropertiesByOwner(agentId);
        ownedProperties.forEach(property => {
          const housingTax = property.price * this.policyState.housingTaxRate;
          if (housingTax > 0) {
            this.decrementBalance(agentId, housingTax, `housing_tax:${property.id}`);
          }
        });
      }
    }
  }

  applyPolicies(policies = []) {
    const nextState = {
      baseIncomeMultiplier: 1,
      salaryMultiplier: 1,
      taxRate: 0,
      housingTaxRate: 0
    };

    policies.forEach(policy => {
      switch (policy.type) {
        case 'citizen_stipend':
          nextState.baseIncomeMultiplier += Number(policy.value || 0);
          break;
        case 'salary_boost':
          nextState.salaryMultiplier += Number(policy.value || 0);
          break;
        case 'tax_rate':
          nextState.taxRate = Math.max(0, Number(policy.value || 0));
          break;
        case 'housing_tax':
          nextState.housingTaxRate = Math.max(0, Number(policy.value || 0));
          break;
        default:
          break;
      }
    });

    this.policyState = nextState;
  }

  incrementBalance(agentId, amount, reason) {
    const current = this.getBalance(agentId);
    this.balances.set(agentId, current + amount);
    this.recordTransaction(agentId, amount, reason);
    this.persistBalance(agentId);
    logger.debug(`Economy: ${agentId} +${amount} (${reason})`);
  }

  decrementBalance(agentId, amount, reason) {
    const current = this.getBalance(agentId);
    if (current < amount) {
      throw new Error('Insufficient balance');
    }
    this.balances.set(agentId, current - amount);
    this.recordTransaction(agentId, -amount, reason);
    this.persistBalance(agentId);
  }

  recordTransaction(agentId, amount, reason) {
    if (!this.transactions.has(agentId)) {
      this.transactions.set(agentId, []);
    }
    const ledger = this.transactions.get(agentId);
    ledger.push({
      amount,
      reason,
      timestamp: Date.now()
    });
    if (ledger.length > 500) {
      ledger.splice(0, ledger.length - 500);
    }
    this.persistTransaction(agentId, amount, reason);
  }

  listJobs() {
    return Array.from(this.jobs.values());
  }

  addJobsForBuilding(building) {
    const templates = this.jobTemplates[building.type] || [];
    templates.forEach((template, index) => {
      const jobId = `${building.id}:${template.role.toLowerCase().replace(/\s+/g, '-')}:${index}`;
      if (this.jobs.has(jobId)) return;
      this.jobs.set(jobId, {
        id: jobId,
        buildingId: building.id,
        buildingName: building.name,
        role: template.role,
        salary: template.salary,
        assignedTo: null
      });
    });
  }

  addPropertyForBuilding(building) {
    const propertyTypes = new Set(['house', 'apartment']);
    if (!propertyTypes.has(building.type)) return;
    if (this.properties.has(building.id)) return;
    const area = building.width * building.height;
    const basePrice = building.type === 'apartment' ? 300 : 200;
    const price = basePrice + area * 25;
    const property = {
      id: building.id,
      name: building.name,
      type: building.type,
      buildingId: building.id,
      price,
      ownerId: null,
      forSale: true
    };
    this.properties.set(building.id, property);
    this.persistProperty(property);
  }

  registerBuilding(building) {
    this.addJobsForBuilding(building);
    this.addPropertyForBuilding(building);
  }

  listProperties() {
    return Array.from(this.properties.values());
  }

  getPropertiesByOwner(agentId) {
    return Array.from(this.properties.values()).filter(property => property.ownerId === agentId);
  }

  getProperty(propertyId) {
    return this.properties.get(propertyId);
  }

  listPropertyForSale(agentId, propertyId, price) {
    this.registerAgent(agentId);
    if (price <= 0) throw new Error('Price must be positive');
    const property = this.getProperty(propertyId);
    if (!property) throw new Error('Property not found');
    if (property.ownerId !== agentId) throw new Error('Not the property owner');
    property.forSale = true;
    property.price = price;
    this.persistProperty(property);
    return property;
  }

  buyProperty(agentId, propertyId) {
    this.registerAgent(agentId);
    const property = this.getProperty(propertyId);
    if (!property) throw new Error('Property not found');
    if (!property.forSale) throw new Error('Property not for sale');
    if (property.ownerId === agentId) throw new Error('Already owner');
    this.decrementBalance(agentId, property.price, `property_purchase:${propertyId}`);
    if (property.ownerId) {
      this.incrementBalance(property.ownerId, property.price, `property_sale:${propertyId}`);
    }
    property.ownerId = agentId;
    property.forSale = false;
    this.persistProperty(property);
    return property;
  }

  applyForJob(agentId, jobId) {
    this.registerAgent(agentId);
    if (this.jobAssignments.has(agentId)) {
      throw new Error('Agent already employed');
    }
    const job = this.jobs.get(jobId);
    if (!job) throw new Error('Job not found');
    if (job.assignedTo) throw new Error('Job already filled');
    job.assignedTo = agentId;
    this.jobAssignments.set(agentId, jobId);
    return job;
  }

  submitReview({ agentId, reviewerId, score, tags = [], reason = '' }) {
    this.registerAgent(agentId);
    this.registerAgent(reviewerId);
    if (!Number.isFinite(score) || score < 0 || score > 5) {
      throw new Error('Score must be between 0 and 5');
    }
    if (!this.reviews.has(agentId)) {
      this.reviews.set(agentId, []);
    }
    const entry = {
      reviewerId,
      score,
      tags,
      reason,
      timestamp: Date.now()
    };
    this.reviews.get(agentId).push(entry);
    const avg = this.getAverageReviewScore(agentId);
    if (avg !== null && avg < this.reviewThreshold) {
      this.fireAgent(agentId);
      return { review: entry, thresholdBreached: true, average: avg };
    }
    return { review: entry, thresholdBreached: false, average: avg };
  }

  getReviews(agentId) {
    return this.reviews.get(agentId) || [];
  }

  getTransactions(agentId) {
    return this.transactions.get(agentId) || [];
  }

  getAverageReviewScore(agentId) {
    const reviews = this.reviews.get(agentId);
    if (!reviews || reviews.length === 0) return null;
    const total = reviews.reduce((sum, review) => sum + review.score, 0);
    return total / reviews.length;
  }

  fireAgent(agentId) {
    const jobId = this.jobAssignments.get(agentId);
    if (!jobId) return null;
    const job = this.jobs.get(jobId);
    if (job) {
      job.assignedTo = null;
    }
    this.jobAssignments.delete(agentId);
    logger.info(`Economy: Agent ${agentId} was removed from job ${jobId}`);
    return job;
  }

  persistBalance(agentId) {
    if (!this.db) return;
    const balance = this.getBalance(agentId);
    this.db.query(
      'INSERT INTO economy_balances (agent_id, balance) VALUES ($1, $2) ON CONFLICT (agent_id) DO UPDATE SET balance = EXCLUDED.balance, updated_at = NOW()',
      [agentId, balance]
    ).catch(error => logger.error('Economy balance persist failed:', error));
  }

  persistTransaction(agentId, amount, reason) {
    if (!this.db) return;
    this.db.query(
      'INSERT INTO economy_transactions (agent_id, amount, reason) VALUES ($1, $2, $3)',
      [agentId, amount, reason]
    ).catch(error => logger.error('Economy transaction persist failed:', error));
  }

  persistProperty(property) {
    if (!this.db) return;
    this.db.query(
      `INSERT INTO economy_properties (property_id, name, type, building_id, price, owner_id, for_sale)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (property_id) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         building_id = EXCLUDED.building_id,
         price = EXCLUDED.price,
         owner_id = EXCLUDED.owner_id,
         for_sale = EXCLUDED.for_sale,
         updated_at = NOW()`,
      [
        property.id,
        property.name,
        property.type,
        property.buildingId,
        property.price,
        property.ownerId,
        property.forSale
      ]
    ).catch(error => logger.error('Property persist failed:', error));
  }

  persistProperties() {
    if (!this.db) return;
    this.properties.forEach(property => this.persistProperty(property));
  }
}

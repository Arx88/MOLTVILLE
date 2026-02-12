import { logger } from '../utils/logger.js';

export class EconomyManager {
  constructor(worldState, options = {}) {
    this.worldState = worldState;
    this.db = options.db || null;
    this.io = options.io || null;
    this.balances = new Map();
    this.jobs = new Map();
    this.jobAssignments = new Map();
    this.jobApplications = new Map();
    this.reviews = new Map();
    this.properties = new Map();
    this.transactions = new Map();
    this.inventories = new Map();
    this.itemTransactions = [];
    this.itemTransactionsByAgent = new Map();
    this.treasuryBalance = 0;
    this.treasuryTotals = {
      income: 0,
      expense: 0
    };
    this.treasuryTransactions = [];
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
    this.jobVoteThreshold = parseInt(process.env.JOB_VOTE_THRESHOLD, 10) || 2;
    this.jobVoteExpiryMs = parseInt(process.env.JOB_VOTE_EXPIRY_MS, 10) || 15 * 60 * 1000;
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

    const inventories = await this.db.query(
      'SELECT agent_id, item_id, name, quantity FROM economy_inventories'
    );
    inventories.rows.forEach(row => {
      if (!this.inventories.has(row.agent_id)) {
        this.inventories.set(row.agent_id, new Map());
      }
      const inventory = this.inventories.get(row.agent_id);
      inventory.set(row.item_id, {
        id: row.item_id,
        name: row.name,
        quantity: parseFloat(row.quantity)
      });
    });

    const jobAssignments = await this.db.query(
      'SELECT agent_id, job_id FROM economy_job_assignments'
    );
    jobAssignments.rows.forEach(row => {
      this.jobAssignments.set(row.agent_id, row.job_id);
      const job = this.jobs.get(row.job_id);
      if (job) {
        job.assignedTo = row.agent_id;
      } else {
        logger.warn(`Economy: Job assignment ${row.job_id} not found for ${row.agent_id}`);
      }
    });

    const reviews = await this.db.query(
      'SELECT agent_id, reviewer_id, score, tags, reason, created_at FROM economy_reviews'
    );
    reviews.rows.forEach(row => {
      if (!this.reviews.has(row.agent_id)) {
        this.reviews.set(row.agent_id, []);
      }
      this.reviews.get(row.agent_id).push({
        reviewerId: row.reviewer_id,
        score: parseFloat(row.score),
        tags: row.tags || [],
        reason: row.reason || '',
        timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now()
      });
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
    this.persistInventoryItem(agentId, item);
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
      this.persistInventoryItem(agentId, { id: itemId, name: existing.name, quantity: 0 });
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
    this.persistInventoryItem(agentId, item);
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

  getAgentSummary(agentId) {
    const jobId = this.jobAssignments.get(agentId);
    const job = jobId ? this.jobs.get(jobId) : null;
    return {
      balance: this.getBalance(agentId),
      inventory: this.getInventory(agentId),
      job: job ? {
        id: job.id,
        role: job.role,
        salary: job.salary,
        buildingId: job.buildingId,
        buildingName: job.buildingName
      } : null,
      properties: this.getPropertiesByOwner(agentId)
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
      incomeTotal.forEach(item => this.applySystemPayout(agentId, item.amount, item.reason));

      if (this.policyState.taxRate > 0 && gross > 0) {
        const taxAmount = gross * this.policyState.taxRate;
        this.collectSystemRevenue(agentId, taxAmount, 'tax_withholding');
      }

      if (this.policyState.housingTaxRate > 0) {
        const ownedProperties = this.getPropertiesByOwner(agentId);
        ownedProperties.forEach(property => {
          const housingTax = property.price * this.policyState.housingTaxRate;
          if (housingTax > 0) {
            this.collectSystemRevenue(agentId, housingTax, `housing_tax:${property.id}`);
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

  applySystemPayout(agentId, amount, reason) {
    if (amount <= 0) return;
    this.incrementBalance(agentId, amount, reason);
    this.recordTreasury(-amount, reason);
  }

  collectSystemRevenue(agentId, amount, reason) {
    if (amount <= 0) return;
    this.decrementBalance(agentId, amount, reason);
    this.recordTreasury(amount, reason);
  }

  recordTreasury(amount, reason) {
    this.treasuryBalance += amount;
    if (amount > 0) {
      this.treasuryTotals.income += amount;
    } else if (amount < 0) {
      this.treasuryTotals.expense += Math.abs(amount);
    }
    this.treasuryTransactions.push({
      amount,
      reason,
      timestamp: Date.now()
    });
    if (this.treasuryTransactions.length > 500) {
      this.treasuryTransactions.splice(0, this.treasuryTransactions.length - 500);
    }
  }

  getTreasurySummary() {
    return {
      balance: this.treasuryBalance,
      income: this.treasuryTotals.income,
      expense: this.treasuryTotals.expense
    };
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

  getApplicationVoteCount(application) {
    if (!application) return 0;
    if (application.votes instanceof Set || application.votes instanceof Map) {
      return application.votes.size;
    }
    if (Array.isArray(application.votes)) {
      return application.votes.length;
    }
    return 0;
  }

  getVoteWeight(voterId, reputationManager = null) {
    if (!reputationManager || !voterId) return 1;
    const rep = reputationManager.getSnapshot(voterId);
    const score = Number(rep?.score || 0);
    return Math.max(0.5, 1 + (score / 100));
  }

  getRelationshipVoteWeight(voterId, applicantId, moltbotRegistry = null) {
    if (!moltbotRegistry || !voterId || !applicantId) {
      // Compatibility path (tests/offline flows): keep voting functional when relationship graph is unavailable.
      return { weight: 1, trust: 0, affinity: 0, interactions: 0, eligible: true };
    }
    const rel = moltbotRegistry.getRelationship(voterId, applicantId) || {};
    const trust = Number(rel.trust || 0);
    const affinity = Number(rel.affinity || 0);
    const interactions = Number(rel.interactions || 0);

    const trustNorm = Math.max(0, Math.min(1, trust / 40));
    const affinityNorm = Math.max(0, Math.min(1, affinity / 50));
    const interactionNorm = Math.max(0, Math.min(1, interactions / 6));
    const relationScore = (trustNorm * 0.55) + (affinityNorm * 0.30) + (interactionNorm * 0.15);

    const eligible = (trust >= 8 && interactions >= 2) || (trust >= 14) || (affinity >= 22 && interactions >= 3);
    return {
      weight: Math.max(0.2, 0.6 + (relationScore * 1.4)),
      trust,
      affinity,
      interactions,
      eligible
    };
  }

  getApplicantBonus(applicantId, reputationManager = null) {
    // Job approvals are relation-first; reputation should not dominate hiring.
    return 0;
  }

  computeApplicationWeight(application, reputationManager = null) {
    if (!application) return 0;
    if (application.votes instanceof Map) {
      return Array.from(application.votes.values()).reduce((sum, weight) => sum + Number(weight || 0), 0);
    }
    const voters = application.votes instanceof Set
      ? Array.from(application.votes)
      : Array.isArray(application.votes)
        ? application.votes
        : [];
    return voters.reduce((sum, voterId) => sum + this.getVoteWeight(voterId, reputationManager), 0);
  }

  listJobs() {
    const applications = new Map();
    this.jobApplications.forEach((app, jobId) => {
      applications.set(jobId, {
        applicantId: app.applicantId,
        votes: this.getApplicationVoteCount(app),
        weightedVotes: Number(this.computeApplicationWeight(app).toFixed(2)),
        createdAt: app.createdAt
      });
    });
    return Array.from(this.jobs.values()).map(job => ({
      ...job,
      application: applications.get(job.id) || null
    }));
  }

  listApplications() {
    return Array.from(this.jobApplications.entries()).map(([jobId, app]) => ({
      jobId,
      applicantId: app.applicantId,
      votes: app.votes instanceof Map ? Array.from(app.votes.keys()) : Array.from(app.votes || []),
      weightedVotes: Number(this.computeApplicationWeight(app).toFixed(2)),
      createdAt: app.createdAt,
      required: this.getRequiredVotes(app)
    }));
  }

  getRequiredVotes(application) {
    const base = Math.max(1, this.jobVoteThreshold);
    if (!application || !Number.isFinite(application.createdAt)) return base;
    const ageMs = Date.now() - Number(application.createdAt);
    if (ageMs >= Math.max(30000, this.jobVoteExpiryMs / 3)) {
      return Math.max(1, base - 1);
    }
    return base;
  }

  getApplicationForAgent(agentId) {
    for (const [jobId, app] of this.jobApplications.entries()) {
      if (app.applicantId === agentId) {
        return {
          jobId,
          ...app,
          votes: app.votes instanceof Map ? Array.from(app.votes.keys()) : Array.from(app.votes || []),
          weightedVotes: Number(this.computeApplicationWeight(app).toFixed(2)),
          required: this.getRequiredVotes(app)
        };
      }
    }
    return null;
  }

  cleanupExpiredApplications() {
    const now = Date.now();
    for (const [jobId, app] of this.jobApplications.entries()) {
      if (now - app.createdAt > this.jobVoteExpiryMs) {
        this.jobApplications.delete(jobId);
      }
    }
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
    // Market normalization (policy-driven): keep entry housing reachable relative
    // to current wages/liquidity so the earn->spend loop can actually occur.
    const salaries = Array.from(this.jobs.values()).map(j => Number(j.salary || 0)).filter(v => Number.isFinite(v) && v > 0);
    const avgSalary = salaries.length ? (salaries.reduce((s, v) => s + v, 0) / salaries.length) : 8;
    const balances = Array.from(this.balances.values()).map(v => Number(v || 0)).filter(v => Number.isFinite(v));
    const avgBalance = balances.length ? (balances.reduce((s, v) => s + v, 0) / balances.length) : 0;
    const targetStarterCap = Math.max(60, Math.round(Math.max(avgSalary * 18, avgBalance * 2.5)));

    this.properties.forEach((property) => {
      if (!property || property.ownerId || property.forSale !== true) return;
      const price = Number(property.price || 0);
      if (!Number.isFinite(price) || price <= 0) return;
      if (price > targetStarterCap) {
        property.price = targetStarterCap;
        this.persistProperty(property);
      }
    });

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
    this.cleanupExpiredApplications();
    if (this.jobAssignments.has(agentId)) {
      throw new Error('Agent already employed');
    }
    const existing = this.getApplicationForAgent(agentId);
    if (existing) {
      return { status: 'pending', jobId: existing.jobId, votes: existing.votes.length, required: this.getRequiredVotes(existing) };
    }
    const job = this.jobs.get(jobId);
    if (!job) throw new Error('Job not found');
    if (job.assignedTo) throw new Error('Job already filled');
    const application = {
      applicantId: agentId,
      votes: new Map(),
      createdAt: Date.now()
    };
    this.jobApplications.set(jobId, application);
    return { status: 'pending', jobId, votes: 0, required: this.getRequiredVotes(application) };
  }

  voteForJob({ applicantId, voterId, jobId, reputationManager = null, moltbotRegistry = null }) {
    this.registerAgent(applicantId);
    this.registerAgent(voterId);
    this.cleanupExpiredApplications();
    if (applicantId === voterId) {
      throw new Error('Cannot vote for self');
    }
    if (this.jobAssignments.has(applicantId)) {
      return { status: 'already_employed' };
    }
    const application = this.jobApplications.get(jobId);
    if (!application || application.applicantId !== applicantId) {
      throw new Error('Application not found');
    }
    if (!(application.votes instanceof Map)) {
      const prevVotes = application.votes instanceof Set ? Array.from(application.votes) : Array.from(application.votes || []);
      application.votes = new Map(prevVotes.map(voter => [voter, 1]));
    }

    const relation = this.getRelationshipVoteWeight(voterId, applicantId, moltbotRegistry);
    const repWeight = this.getVoteWeight(voterId, reputationManager);
    // Even low-trust voters can support candidates, but with low impact.
    // This avoids deadlocks where nobody can ever cross the initial trust barrier.
    const baseWeight = relation.eligible
      ? ((relation.weight * 0.7) + (repWeight * 0.3))
      : Math.max(0.4, ((relation.weight * 0.45) + (repWeight * 0.15)));
    const voterWeight = Number(baseWeight.toFixed(3));
    application.votes.set(voterId, voterWeight);

    const votes = application.votes.size;
    const weightedVotes = this.computeApplicationWeight(application, reputationManager);
    const applicantBonus = this.getApplicantBonus(applicantId, reputationManager);
    const finalScore = weightedVotes + applicantBonus;
    const requiredVotes = this.getRequiredVotes(application);

    if (reputationManager) {
      reputationManager.adjust(voterId, 0.35, {
        reason: 'job_vote_cast',
        jobId,
        applicantId,
        weight: voterWeight,
        relationTrust: relation.trust,
        relationAffinity: relation.affinity,
        relationInteractions: relation.interactions
      });
      reputationManager.adjust(applicantId, 0.15, { reason: 'job_vote_received', jobId, voterId });
    }

    if (finalScore >= requiredVotes) {
      const job = this.jobs.get(jobId);
      if (!job) throw new Error('Job not found');
      if (job.assignedTo) throw new Error('Job already filled');
      job.assignedTo = applicantId;
      this.jobAssignments.set(applicantId, jobId);
      this.persistJobAssignment(applicantId, jobId);
      this.jobApplications.delete(jobId);

      if (reputationManager) {
        reputationManager.adjust(applicantId, 0.8, { reason: 'job_assignment_approved', jobId, weightedVotes, applicantBonus });
      }

      return {
        status: 'approved',
        job,
        votes,
        weightedVotes: Number(weightedVotes.toFixed(2)),
        applicantBonus: Number(applicantBonus.toFixed(2)),
        score: Number(finalScore.toFixed(2)),
        required: requiredVotes
      };
    }

    return {
      status: 'pending',
      jobId,
      votes,
      weightedVotes: Number(weightedVotes.toFixed(2)),
      applicantBonus: Number(applicantBonus.toFixed(2)),
      score: Number(finalScore.toFixed(2)),
      required: requiredVotes
    };
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
    this.persistReview(agentId, entry);
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
    this.deleteJobAssignment(agentId);
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

  persistInventoryItem(agentId, item) {
    if (!this.db) return;
    if (!item || !item.id) return;
    if (item.quantity <= 0) {
      this.db.query(
        'DELETE FROM economy_inventories WHERE agent_id = $1 AND item_id = $2',
        [agentId, item.id]
      ).catch(error => logger.error('Inventory delete failed:', error));
      return;
    }
    this.db.query(
      `INSERT INTO economy_inventories (agent_id, item_id, name, quantity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (agent_id, item_id) DO UPDATE SET
         name = EXCLUDED.name,
         quantity = EXCLUDED.quantity,
         updated_at = NOW()`,
      [agentId, item.id, item.name, item.quantity]
    ).catch(error => logger.error('Inventory persist failed:', error));
  }

  persistJobAssignment(agentId, jobId) {
    if (!this.db) return;
    this.db.query(
      `INSERT INTO economy_job_assignments (agent_id, job_id)
       VALUES ($1, $2)
       ON CONFLICT (agent_id) DO UPDATE SET
         job_id = EXCLUDED.job_id,
         assigned_at = NOW()`,
      [agentId, jobId]
    ).catch(error => logger.error('Job assignment persist failed:', error));
  }

  deleteJobAssignment(agentId) {
    if (!this.db) return;
    this.db.query(
      'DELETE FROM economy_job_assignments WHERE agent_id = $1',
      [agentId]
    ).catch(error => logger.error('Job assignment delete failed:', error));
  }

  persistReview(agentId, review) {
    if (!this.db) return;
    this.db.query(
      `INSERT INTO economy_reviews (agent_id, reviewer_id, score, tags, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [agentId, review.reviewerId, review.score, JSON.stringify(review.tags || []), review.reason]
    ).catch(error => logger.error('Review persist failed:', error));
  }

  createSnapshot() {
    return {
      balances: Array.from(this.balances.entries()),
      jobs: Array.from(this.jobs.entries()),
      jobAssignments: Array.from(this.jobAssignments.entries()),
      jobApplications: Array.from(this.jobApplications.entries()).map(([jobId, app]) => [
        jobId,
        {
          ...app,
          votes: app.votes instanceof Map
            ? Array.from(app.votes.entries())
            : app.votes instanceof Set
              ? Array.from(app.votes).map(voterId => [voterId, 1])
              : []
        }
      ]),
      reviews: Array.from(this.reviews.entries()),
      properties: Array.from(this.properties.entries()),
      transactions: Array.from(this.transactions.entries()),
      inventories: Array.from(this.inventories.entries()).map(([agentId, inventory]) => ([
        agentId,
        Array.from(inventory.values()).map(item => ({ ...item }))
      ])),
      itemTransactions: [...this.itemTransactions],
      itemTransactionsByAgent: Array.from(this.itemTransactionsByAgent.entries()),
      treasuryBalance: this.treasuryBalance,
      treasuryTotals: { ...this.treasuryTotals },
      treasuryTransactions: [...this.treasuryTransactions],
      policyState: { ...this.policyState },
      lastIncomeAt: this.lastIncomeAt
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot) return;
    this.balances = new Map(snapshot.balances || []);

    if (Array.isArray(snapshot.jobs) && snapshot.jobs.length) {
      this.jobs = new Map(snapshot.jobs);
    } else {
      this.jobs = new Map();
      this.initializeJobs();
    }

    this.jobAssignments = new Map(snapshot.jobAssignments || []);
    this.jobAssignments.forEach((jobId, agentId) => {
      const job = this.jobs.get(jobId);
      if (job) {
        job.assignedTo = agentId;
      }
    });

    this.jobApplications = new Map((snapshot.jobApplications || []).map(([jobId, app]) => {
      const rawVotes = app?.votes || [];
      const votesMap = new Map(
        rawVotes.map((entry) => {
          if (Array.isArray(entry)) return [entry[0], Number(entry[1]) || 1];
          return [entry, 1];
        })
      );
      return [jobId, { ...app, votes: votesMap }];
    }));

    this.reviews = new Map(snapshot.reviews || []);

    if (Array.isArray(snapshot.properties) && snapshot.properties.length) {
      this.properties = new Map(snapshot.properties);
    } else {
      this.properties = new Map();
      this.initializeProperties();
    }

    this.transactions = new Map(snapshot.transactions || []);

    this.inventories = new Map();
    (snapshot.inventories || []).forEach(([agentId, items]) => {
      const inventory = new Map();
      (items || []).forEach(item => {
        if (item && item.id) {
          inventory.set(item.id, { ...item });
        }
      });
      this.inventories.set(agentId, inventory);
    });

    this.itemTransactions = Array.isArray(snapshot.itemTransactions) ? [...snapshot.itemTransactions] : [];
    this.itemTransactionsByAgent = new Map(snapshot.itemTransactionsByAgent || []);
    this.treasuryBalance = Number(snapshot.treasuryBalance) || 0;
    this.treasuryTotals = snapshot.treasuryTotals
      ? { ...this.treasuryTotals, ...snapshot.treasuryTotals }
      : { ...this.treasuryTotals };
    this.treasuryTransactions = Array.isArray(snapshot.treasuryTransactions)
      ? [...snapshot.treasuryTransactions]
      : [];
    this.policyState = snapshot.policyState ? { ...snapshot.policyState } : { ...this.policyState };
    this.lastIncomeAt = snapshot.lastIncomeAt || Date.now();
  }

  persistProperties() {
    if (!this.db) return;
    this.properties.forEach(property => this.persistProperty(property));
  }
}

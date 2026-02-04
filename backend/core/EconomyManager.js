import { logger } from '../utils/logger.js';

export class EconomyManager {
  constructor(worldState, options = {}) {
    this.worldState = worldState;
    this.db = options.db || null;
    this.balances = new Map();
    this.jobs = new Map();
    this.jobAssignments = new Map();
    this.reviews = new Map();
    this.properties = new Map();
    this.transactions = new Map();
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
      library: [
        { role: 'Librarian', salary: 7 },
        { role: 'Mentor', salary: 5 }
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
  }

  getBalance(agentId) {
    return this.balances.get(agentId) ?? 0;
  }

  getAverageBalance() {
    if (this.balances.size === 0) return 0;
    const total = Array.from(this.balances.values()).reduce((sum, value) => sum + value, 0);
    return total / this.balances.size;
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
    this.transactions.get(agentId).push({
      amount,
      reason,
      timestamp: Date.now()
    });
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
    const property = this.getProperty(propertyId);
    if (!property) throw new Error('Property not found');
    if (property.ownerId !== agentId) throw new Error('Not the property owner');
    property.forSale = true;
    property.price = price;
    this.persistProperty(property);
    return property;
  }

  buyProperty(agentId, propertyId) {
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
    const job = this.jobs.get(jobId);
    if (!job) throw new Error('Job not found');
    if (job.assignedTo) throw new Error('Job already filled');
    job.assignedTo = agentId;
    this.jobAssignments.set(agentId, jobId);
    return job;
  }

  submitReview({ agentId, reviewerId, score, tags = [], reason = '' }) {
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

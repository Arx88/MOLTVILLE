import { logger } from '../utils/logger.js';

export class EconomyManager {
  constructor(worldState) {
    this.worldState = worldState;
    this.balances = new Map();
    this.jobs = new Map();
    this.jobAssignments = new Map();
    this.reviews = new Map();
    this.properties = new Map();
    this.transactions = new Map();
    this.lastIncomeAt = Date.now();
    this.incomeIntervalMs = parseInt(process.env.INCOME_INTERVAL_MS, 10) || 60000;
    this.baseIncome = parseFloat(process.env.BASE_INCOME || '2');
    this.reviewThreshold = parseFloat(process.env.REVIEW_THRESHOLD || '2.5');
    this.initializeJobs();
    this.initializeProperties();
  }

  initializeJobs() {
    const jobTemplates = {
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
      ]
    };

    this.worldState.buildings.forEach(building => {
      const templates = jobTemplates[building.type] || [];
      templates.forEach((template, index) => {
        const jobId = `${building.id}:${template.role.toLowerCase().replace(/\s+/g, '-')}:${index}`;
        this.jobs.set(jobId, {
          id: jobId,
          buildingId: building.id,
          buildingName: building.name,
          role: template.role,
          salary: template.salary,
          assignedTo: null
        });
      });
    });
  }

  initializeProperties() {
    const propertyTypes = new Set(['house', 'apartment']);
    this.worldState.buildings.forEach(building => {
      if (!propertyTypes.has(building.type)) return;
      const area = building.width * building.height;
      const basePrice = building.type === 'apartment' ? 300 : 200;
      const price = basePrice + area * 25;
      this.properties.set(building.id, {
        id: building.id,
        name: building.name,
        type: building.type,
        buildingId: building.id,
        price,
        ownerId: null,
        forSale: true
      });
    });
  }

  registerAgent(agentId) {
    if (!this.balances.has(agentId)) {
      this.balances.set(agentId, parseFloat(process.env.STARTING_BALANCE || '10'));
      this.transactions.set(agentId, []);
      logger.info(`Economy: Initialized balance for agent ${agentId}`);
    }
  }

  getBalance(agentId) {
    return this.balances.get(agentId) ?? 0;
  }

  tick() {
    const now = Date.now();
    if (now - this.lastIncomeAt < this.incomeIntervalMs) return;
    this.lastIncomeAt = now;

    for (const agentId of this.balances.keys()) {
      this.incrementBalance(agentId, this.baseIncome, 'base_income');
      const jobId = this.jobAssignments.get(agentId);
      if (jobId) {
        const job = this.jobs.get(jobId);
        if (job) {
          this.incrementBalance(agentId, job.salary, 'job_salary');
        }
      }
    }
  }

  incrementBalance(agentId, amount, reason) {
    const current = this.getBalance(agentId);
    this.balances.set(agentId, current + amount);
    this.recordTransaction(agentId, amount, reason);
    logger.debug(`Economy: ${agentId} +${amount} (${reason})`);
  }

  decrementBalance(agentId, amount, reason) {
    const current = this.getBalance(agentId);
    if (current < amount) {
      throw new Error('Insufficient balance');
    }
    this.balances.set(agentId, current - amount);
    this.recordTransaction(agentId, -amount, reason);
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
  }

  listJobs() {
    return Array.from(this.jobs.values());
  }

  listProperties() {
    return Array.from(this.properties.values());
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
}

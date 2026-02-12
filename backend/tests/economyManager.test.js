import test from 'node:test';
import assert from 'node:assert/strict';
import { EconomyManager } from '../core/EconomyManager.js';

const createManager = () => new EconomyManager({ buildings: [] });
const createManagerWithBuildings = () => new EconomyManager({
  buildings: [
    { id: 'cafe-1', name: 'Cafe', type: 'cafe', width: 2, height: 2 },
    { id: 'house-1', name: 'House', type: 'house', width: 2, height: 2 }
  ]
});

test('EconomyManager.applyPolicies aggregates policy effects', () => {
  const manager = createManager();

  manager.applyPolicies([
    { type: 'citizen_stipend', value: 0.5 },
    { type: 'salary_boost', value: 0.2 },
    { type: 'tax_rate', value: 0.15 },
    { type: 'housing_tax', value: 0.02 }
  ]);

  assert.equal(manager.policyState.baseIncomeMultiplier, 1.5);
  assert.equal(manager.policyState.salaryMultiplier, 1.2);
  assert.equal(manager.policyState.taxRate, 0.15);
  assert.equal(manager.policyState.housingTaxRate, 0.02);
});

test('EconomyManager.applyPolicies clamps negative taxes to zero', () => {
  const manager = createManager();

  manager.applyPolicies([
    { type: 'tax_rate', value: -0.4 },
    { type: 'housing_tax', value: -0.1 }
  ]);

  assert.equal(manager.policyState.taxRate, 0);
  assert.equal(manager.policyState.housingTaxRate, 0);
});

test('EconomyManager tracks treasury payouts and revenue', () => {
  const manager = createManager();
  manager.registerAgent('agent-1');

  manager.applySystemPayout('agent-1', 5, 'base_income');
  manager.collectSystemRevenue('agent-1', 2, 'tax_withholding');

  const summary = manager.getTreasurySummary();
  assert.equal(summary.expense, 5);
  assert.equal(summary.income, 2);
  assert.equal(summary.balance, -3);
});

test('EconomyManager assigns jobs and properties', () => {
  const manager = createManagerWithBuildings();
  manager.registerAgent('agent-1');
  manager.incrementBalance('agent-1', 1000, 'seed');

  const job = manager.listJobs()[0];
  const assignment = manager.applyForJob('agent-1', job.id);
  assert.equal(assignment.status, 'pending');
  assert.equal(assignment.jobId, job.id);

  const property = manager.listProperties()[0];
  const purchased = manager.buyProperty('agent-1', property.id);
  assert.equal(purchased.ownerId, 'agent-1');

  const listed = manager.listPropertyForSale('agent-1', property.id, 500);
  assert.equal(listed.forSale, true);
  assert.equal(listed.price, 500);
});

test('EconomyManager adds and removes inventory items', () => {
  const manager = createManager();
  manager.registerAgent('agent-1');

  const added = manager.addItem('agent-1', { itemId: 'apple', name: 'Apple', quantity: 2 });
  assert.equal(added.quantity, 2);

  const removed = manager.removeItem('agent-1', { itemId: 'apple', quantity: 1 });
  assert.equal(removed.quantity, 1);
});

test('EconomyManager returns summaries and reviews', () => {
  const manager = createManagerWithBuildings();
  manager.registerAgent('agent-1');
  manager.applyForJob('agent-1', manager.listJobs()[0].id);
  manager.submitReview({
    agentId: 'agent-1',
    reviewerId: 'agent-2',
    score: 4,
    tags: ['helpful'],
    reason: 'good'
  });

  const summary = manager.getAgentSummary('agent-1');
  assert.equal(summary.job, null);
  assert.ok(Array.isArray(summary.inventory));
  assert.equal(manager.getReviews('agent-1').length, 1);
});

test('EconomyManager initializes from database rows', async () => {
  const db = {
    async query(sql) {
      if (sql.startsWith('SELECT agent_id, balance')) {
        return { rows: [{ agent_id: 'agent-1', balance: '12' }] };
      }
      if (sql.startsWith('SELECT agent_id, item_id')) {
        return { rows: [{ agent_id: 'agent-1', item_id: 'apple', name: 'Apple', quantity: '3' }] };
      }
      if (sql.startsWith('SELECT agent_id, job_id')) {
        return { rows: [{ agent_id: 'agent-1', job_id: 'cafe-1:barista:0' }] };
      }
      if (sql.startsWith('SELECT agent_id, reviewer_id')) {
        return { rows: [{ agent_id: 'agent-1', reviewer_id: 'agent-2', score: '5', tags: ['great'], reason: 'ok', created_at: new Date() }] };
      }
      if (sql.startsWith('SELECT * FROM economy_properties')) {
        return { rows: [{ property_id: 'house-1', name: 'House', type: 'house', building_id: 'house-1', price: '200', owner_id: null, for_sale: true }] };
      }
      return { rows: [] };
    }
  };
  const manager = new EconomyManager({
    buildings: [
      { id: 'cafe-1', name: 'Cafe', type: 'cafe', width: 2, height: 2 },
      { id: 'house-1', name: 'House', type: 'house', width: 2, height: 2 }
    ]
  }, { db });

  await manager.initializeFromDb();

  assert.equal(manager.getBalance('agent-1'), 12);
  assert.equal(manager.getInventory('agent-1')[0].quantity, 3);
  assert.ok(manager.listJobs().length > 0);
  assert.ok(manager.listProperties().length > 0);
});

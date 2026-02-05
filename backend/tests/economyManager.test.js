import test from 'node:test';
import assert from 'node:assert/strict';
import { EconomyManager } from '../core/EconomyManager.js';

const createManager = () => new EconomyManager({ buildings: [] });

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

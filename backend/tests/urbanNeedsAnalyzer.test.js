import test from 'node:test';
import assert from 'node:assert/strict';

import { WorldStateManager } from '../core/WorldStateManager.js';
import { buildUrbanNeedsHeatmap, getDistrictNeeds } from '../core/UrbanNeedsAnalyzer.js';

test('Urban needs heatmap detects unmet food and employment demand', () => {
  const world = new WorldStateManager();
  world.buildings = [];
  world.districts = [
    {
      id: 'central',
      name: 'Distrito Central',
      bounds: { minX: 0, minY: 0, maxX: 30, maxY: 30 },
      unlocked: true
    }
  ];

  world.agents.clear();
  world.addAgent('agent-1', { x: 10, y: 10 });
  world.addAgent('agent-2', { x: 12, y: 10 });

  world.agents.get('agent-1').needs = { hunger: 95, energy: 20, social: 20, fun: 25 };
  world.agents.get('agent-2').needs = { hunger: 92, energy: 18, social: 25, fun: 22 };

  const heatmap = buildUrbanNeedsHeatmap({
    worldState: world,
    economyManager: {
      jobAssignments: new Map(),
      properties: new Map()
    }
  });

  assert.equal(heatmap.districts.length, 1);
  const district = heatmap.districts[0];
  assert.ok(district.needs.food >= 1);
  assert.ok(district.needs.employment >= 1);
  assert.ok(Array.isArray(district.topNeeds));

  const detail = getDistrictNeeds({
    worldState: world,
    economyManager: { jobAssignments: new Map(), properties: new Map() },
    districtId: 'central'
  });
  assert.equal(detail.id, 'central');
  assert.ok(detail.identity.label.length > 0);
});

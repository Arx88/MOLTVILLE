const CATEGORY_BUILDINGS = Object.freeze({
  food: ['cafe', 'restaurant', 'bakery', 'market', 'shop', 'inn', 'bar'],
  health: ['clinic', 'hospital'],
  employment: ['factory', 'workshop', 'office', 'shop', 'market', 'cafe', 'restaurant', 'library', 'bank', 'hotel', 'gallery'],
  housing: ['house', 'apartment', 'inn', 'hotel'],
  commerce: ['shop', 'market', 'bank'],
  social: ['plaza', 'cafe', 'market', 'garden', 'bar', 'library'],
  fun: ['garden', 'plaza', 'gallery', 'theater', 'museum', 'park']
});

const IDENTITY_RULES = [
  {
    label: 'Distrito Gastronomico',
    predicate: ({ supply }) => (supply.food || 0) >= 3,
    reason: 'alta densidad de servicios de comida y encuentro'
  },
  {
    label: 'Barrio Productivo',
    predicate: ({ supply, needs }) => (supply.employment || 0) >= 3 && (needs.employment || 0) <= 1,
    reason: 'oferta de empleo sostenida y baja demanda de trabajo'
  },
  {
    label: 'Zona Residencial',
    predicate: ({ supply }) => (supply.housing || 0) >= 3,
    reason: 'predominio de vivienda y estancia'
  },
  {
    label: 'Distrito Cultural',
    predicate: ({ supply }) => ((supply.fun || 0) + (supply.social || 0)) >= 5,
    reason: 'actividad social y recreativa intensa'
  }
];

const DEFAULT_RADIUS = Object.freeze({
  food: 10,
  health: 12,
  housing: 15,
  commerce: 12,
  social: 10,
  fun: 12
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

const inBounds = (x, y, bounds) => {
  if (!bounds) return false;
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
};

const centerOf = (building) => ({
  x: Number(building?.x || 0) + (Number(building?.width || 1) / 2),
  y: Number(building?.y || 0) + (Number(building?.height || 1) / 2)
});

const distance = (a, b) => {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.sqrt(((a.x || 0) - (b.x || 0)) ** 2 + ((a.y || 0) - (b.y || 0)) ** 2);
};

const hasNearbyType = (position, buildings, acceptedTypes, radius) => {
  if (!position || !Array.isArray(buildings)) return false;
  const allowed = new Set(acceptedTypes || []);
  return buildings.some((building) => {
    if (!allowed.has(building.type)) return false;
    return distance(position, centerOf(building)) <= radius;
  });
};

const classifySupply = (districtBuildings) => {
  const supply = {
    food: 0,
    health: 0,
    employment: 0,
    housing: 0,
    commerce: 0,
    social: 0,
    fun: 0
  };

  districtBuildings.forEach((building) => {
    Object.entries(CATEGORY_BUILDINGS).forEach(([category, types]) => {
      if (types.includes(building.type)) {
        supply[category] += 1;
      }
    });
  });

  return supply;
};

const pickIdentity = ({ district, supply, needs }) => {
  const matched = IDENTITY_RULES.find((rule) => {
    try {
      return rule.predicate({ district, supply, needs });
    } catch {
      return false;
    }
  });

  if (matched) {
    return { label: matched.label, reason: matched.reason };
  }

  const topNeed = Object.entries(needs || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0];

  if (topNeed && Number(topNeed[1] || 0) > 0) {
    return {
      label: `Distrito en transicion (${topNeed[0]})`,
      reason: `demanda no satisfecha dominante en ${topNeed[0]}`
    };
  }

  return {
    label: district?.name || 'Distrito Estable',
    reason: 'equilibrio actual entre oferta y demanda'
  };
};

const buildOwnedPropertiesIndex = (economyManager) => {
  const byOwner = new Map();
  const values = economyManager?.properties instanceof Map ? Array.from(economyManager.properties.values()) : [];
  values.forEach((property) => {
    if (!property?.ownerId) return;
    if (!byOwner.has(property.ownerId)) byOwner.set(property.ownerId, 0);
    byOwner.set(property.ownerId, byOwner.get(property.ownerId) + 1);
  });
  return byOwner;
};

const calculateDistrictNeeds = ({ district, worldState, economyManager, allBuildings, agents, ownedProperties }) => {
  const thresholds = worldState?.needThresholds || {};
  const districtBuildings = allBuildings.filter((building) => {
    const cx = Number(building?.x || 0) + (Number(building?.width || 1) / 2);
    const cy = Number(building?.y || 0) + (Number(building?.height || 1) / 2);
    return inBounds(cx, cy, district.bounds);
  });
  const districtAgents = agents.filter((agent) => inBounds(Number(agent?.x || 0), Number(agent?.y || 0), district.bounds));

  const supply = classifySupply(districtBuildings);
  const needs = {
    food: 0,
    health: 0,
    employment: 0,
    housing: 0,
    commerce: 0,
    social: 0,
    fun: 0
  };

  districtAgents.forEach((agent) => {
    const pos = { x: Number(agent?.x || 0), y: Number(agent?.y || 0) };
    const agentNeeds = agent?.needs || {};
    const hasJob = economyManager?.jobAssignments instanceof Map
      ? economyManager.jobAssignments.has(agent.id)
      : Boolean(agent?.occupation || agent?.jobId);
    const currentBuildingType = worldState?.buildings?.find((entry) => entry.id === agent?.currentBuilding)?.type;
    const hasHousing = ['house', 'apartment', 'inn', 'hotel'].includes(currentBuildingType)
      || Boolean(ownedProperties.get(agent.id));

    if ((agentNeeds.hunger || 0) >= Number(thresholds.hunger || 70)
      && !hasNearbyType(pos, allBuildings, CATEGORY_BUILDINGS.food, DEFAULT_RADIUS.food)) {
      needs.food += 1;
    }

    if ((agentNeeds.energy || 100) <= Number(thresholds.energy || 30)
      && !hasNearbyType(pos, allBuildings, CATEGORY_BUILDINGS.health, DEFAULT_RADIUS.health)) {
      needs.health += 1;
    }

    if (!hasJob) {
      needs.employment += 1;
    }

    if (!hasHousing && !hasNearbyType(pos, allBuildings, CATEGORY_BUILDINGS.housing, DEFAULT_RADIUS.housing)) {
      needs.housing += 1;
    }

    if (!hasNearbyType(pos, allBuildings, CATEGORY_BUILDINGS.commerce, DEFAULT_RADIUS.commerce)) {
      needs.commerce += 1;
    }

    if ((agentNeeds.social || 100) <= Number(thresholds.social || 30)
      && !hasNearbyType(pos, allBuildings, CATEGORY_BUILDINGS.social, DEFAULT_RADIUS.social)) {
      needs.social += 1;
    }

    if ((agentNeeds.fun || 100) <= Number(thresholds.fun || 30)
      && !hasNearbyType(pos, allBuildings, CATEGORY_BUILDINGS.fun, DEFAULT_RADIUS.fun)) {
      needs.fun += 1;
    }
  });

  const population = districtAgents.length;
  const pressure = Object.entries(needs).reduce((acc, [key, value]) => {
    acc[key] = population > 0 ? Number((value / population).toFixed(3)) : 0;
    return acc;
  }, {});

  const topNeeds = Object.entries(needs)
    .map(([need, value]) => ({
      need,
      value,
      pressure: pressure[need],
      supply: supply[need] || 0,
      gap: Math.max(0, value - (supply[need] || 0))
    }))
    .sort((a, b) => (b.pressure - a.pressure) || (b.value - a.value))
    .slice(0, 3);

  const identity = pickIdentity({ district, supply, needs });

  return {
    id: district.id,
    name: district.name,
    unlocked: Boolean(district.unlocked),
    population,
    buildingCount: districtBuildings.length,
    needs,
    pressure,
    supply,
    topNeeds,
    identity
  };
};

export const buildUrbanNeedsHeatmap = ({ worldState, economyManager }) => {
  if (!worldState) {
    return {
      generatedAt: Date.now(),
      tick: 0,
      districts: [],
      totals: {}
    };
  }

  const districts = Array.isArray(worldState.districts) ? worldState.districts : [];
  const buildings = Array.isArray(worldState.buildings) ? worldState.buildings : [];
  const agents = worldState.agents instanceof Map
    ? Array.from(worldState.agents.values())
    : [];
  const ownedProperties = buildOwnedPropertiesIndex(economyManager);

  const districtSummaries = districts.map((district) => calculateDistrictNeeds({
    district,
    worldState,
    economyManager,
    allBuildings: buildings,
    agents,
    ownedProperties
  }));

  const totals = districtSummaries.reduce((acc, district) => {
    Object.entries(district.needs).forEach(([need, value]) => {
      acc[need] = (acc[need] || 0) + value;
    });
    return acc;
  }, {});

  return {
    generatedAt: Date.now(),
    tick: typeof worldState.getCurrentTick === 'function' ? worldState.getCurrentTick() : 0,
    districts: districtSummaries,
    totals
  };
};

export const getDistrictNeeds = ({ worldState, economyManager, districtId }) => {
  const heatmap = buildUrbanNeedsHeatmap({ worldState, economyManager });
  return heatmap.districts.find((district) => district.id === districtId) || null;
};

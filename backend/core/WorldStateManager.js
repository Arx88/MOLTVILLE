import { logger } from '../utils/logger.js';

export class WorldStateManager {
  constructor() {
    this.tickCount = 0;
    this.agents = new Map();
    this.buildings = this.initializeBuildings();
    this.width = 64;
    this.height = 64;
    this.districts = this.initializeDistricts();
    this.tiles = this.initializeTiles();
    this.lots = this.initializeLots();
    this.tileSize = 32;
    this.dayLengthMs = parseInt(process.env.DAY_LENGTH_MS, 10) || 7200000;
    this.weatherChangeMs = parseInt(process.env.WEATHER_CHANGE_MS, 10) || 3600000;
    this.worldStart = Date.now();
    this.weatherState = {
      current: 'clear',
      lastChange: Date.now()
    };
    this.lastExpansionCheck = 0;
    if (!Number.isFinite(this.lastNeedUpdate)) {
      this.lastNeedUpdate = Date.now();
    }
    if (!Number.isFinite(this.lastExpansionCheck)) {
      this.lastExpansionCheck = 0;
    }
    this.needRates = {
      hungerPerMinute: parseFloat(process.env.NEED_HUNGER_PER_MINUTE || '1.2'),
      energyPerMinute: parseFloat(process.env.NEED_ENERGY_PER_MINUTE || '0.6'),
      socialPerMinute: parseFloat(process.env.NEED_SOCIAL_PER_MINUTE || '0.4'),
      funPerMinute: parseFloat(process.env.NEED_FUN_PER_MINUTE || '0.4')
    };
    this.needThresholds = {
      hunger: parseFloat(process.env.NEED_HUNGER_THRESHOLD || '70'),
      energy: parseFloat(process.env.NEED_ENERGY_THRESHOLD || '30'),
      social: parseFloat(process.env.NEED_SOCIAL_THRESHOLD || '30'),
      fun: parseFloat(process.env.NEED_FUN_THRESHOLD || '30')
    };
    // Movement interpolation state per agent
    this.movementState = new Map(); // agentId -> { fromX, fromY, toX, toY, progress, path }
  }

  initializeBuildings() {
    return [
      // Cafés & Social
      { id: 'cafe1',    name: 'Hobbs Café',        type: 'cafe',       x: 14, y: 8,  width: 5, height: 4, occupancy: [] },
      { id: 'cafe2',    name: 'Corner Bistro',      type: 'cafe',       x: 42, y: 18, width: 4, height: 3, occupancy: [] },
      // Library & Culture
      { id: 'library',  name: 'City Library',       type: 'library',    x: 24, y: 6,  width: 6, height: 5, occupancy: [] },
      { id: 'gallery',  name: 'Art Gallery',        type: 'gallery',    x: 50, y: 8,  width: 4, height: 4, occupancy: [] },
      // Shops & Commerce
      { id: 'shop1',    name: 'General Store',      type: 'shop',       x: 30, y: 14, width: 4, height: 3, occupancy: [] },
      { id: 'shop2',    name: 'Bookshop',           type: 'shop',       x: 8,  y: 22, width: 3, height: 3, occupancy: [] },
      { id: 'market',   name: 'Market Square',      type: 'market',     x: 36, y: 28, width: 6, height: 5, occupancy: [] },
      // Residences (varied sizes)
      { id: 'house1',   name: 'Maple House',        type: 'house',      x: 6,  y: 6,  width: 3, height: 2, occupancy: [] },
      { id: 'house2',   name: 'Oak Cottage',        type: 'house',      x: 10, y: 14, width: 2, height: 2, occupancy: [] },
      { id: 'house3',   name: 'Pine Villa',         type: 'house',      x: 4,  y: 28, width: 3, height: 3, occupancy: [] },
      { id: 'house4',   name: 'Cedar Home',         type: 'house',      x: 48, y: 24, width: 3, height: 2, occupancy: [] },
      { id: 'house5',   name: 'Birch Flat',         type: 'house',      x: 54, y: 32, width: 2, height: 3, occupancy: [] },
      { id: 'house6',   name: 'Elm Residence',      type: 'house',      x: 18, y: 36, width: 3, height: 2, occupancy: [] },
      // Tall Buildings
      { id: 'tower1',   name: 'City Hall',          type: 'civic',      x: 28, y: 22, width: 4, height: 4, occupancy: [] },
      { id: 'tower2',   name: 'Bell Tower',         type: 'tower',      x: 20, y: 24, width: 3, height: 3, occupancy: [] },
      { id: 'apts',     name: 'Sunrise Apartments', type: 'apartment',  x: 44, y: 34, width: 5, height: 4, occupancy: [] },
      // Parks & Public
      { id: 'plaza',    name: 'Central Plaza',      type: 'plaza',      x: 16, y: 18, width: 6, height: 6, occupancy: [] },
      { id: 'park2',    name: 'Sunset Garden',      type: 'garden',     x: 40, y: 42, width: 7, height: 6, occupancy: [] },
      // Special
      { id: 'inn',      name: 'Travelers Inn',      type: 'inn',        x: 52, y: 42, width: 4, height: 3, occupancy: [] },
      { id: 'church',   name: 'Chapel',             type: 'chapel',     x: 8,  y: 42, width: 3, height: 4, occupancy: [] },
    ];
  }

  initializeTiles() {
    const tiles = {};
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const key = `${x},${y}`;
        let type = 'grass';

        // Water: bottom-right lake + stream
        if (x > 52 && y > 52) type = 'water';
        if (x > 56 && y > 46) type = 'water';
        if (x >= 38 && x <= 40 && y >= 44 && y <= 64) type = 'water';
        if (x >= 40 && x <= 42 && y >= 50 && y <= 60) type = 'water';

        // Sand around water
        if ((x === 52 && y > 52) || (x > 52 && y === 52)) type = 'sand';
        if (x === 37 && y >= 44 && y <= 55) type = 'sand';
        if (x === 41 && y >= 44 && y <= 55) type = 'sand';

        // Main roads (3-tile wide arterials)
        if (y >= 11 && y <= 13 && x >= 2 && x <= 62) type = 'road';
        if (y >= 25 && y <= 27 && x >= 2 && x <= 60) type = 'road';
        if (y >= 39 && y <= 41 && x >= 2 && x <= 55) type = 'road';
        if (x >= 11 && x <= 13 && y >= 2 && y <= 55) type = 'road';
        if (x >= 25 && x <= 27 && y >= 2 && y <= 55) type = 'road';
        if (x >= 37 && x <= 39 && y >= 2 && y <= 42) type = 'road';
        if (x >= 49 && x <= 51 && y >= 2 && y <= 50) type = 'road';

        // Paths
        if (y === 20 && x >= 13 && x <= 25) type = 'path';
        if (y === 33 && x >= 13 && x <= 25) type = 'path';
        if (x === 20 && y >= 13 && y <= 25) type = 'path';
        if (x === 32 && y >= 13 && y <= 25) type = 'path';
        if (x === 45 && y >= 13 && y <= 25) type = 'path';
        if (y === 48 && x >= 2  && x <= 37) type = 'path';
        if (x === 8  && y >= 27 && y <= 39) type = 'path';
        if (x === 33 && y >= 27 && y <= 39) type = 'path';
        if (x === 46 && y >= 27 && y <= 39) type = 'path';

        // Plaza area
        const plaza = this.buildings ? this.buildings.find(b => b.id === 'plaza') : null;
        if (plaza && x >= plaza.x && x < plaza.x + plaza.width && y >= plaza.y && y < plaza.y + plaza.height) {
          type = 'stone';
        }

        tiles[key] = {
          type,
          walkable: type !== 'water'
        };
      }
    }

    // Mark building footprints as not walkable (except plazas/gardens)
    if (this.buildings) {
      this.buildings.forEach(b => this.markBuildingFootprint(tiles, b));
    }

    return tiles;
  }

  initializeDistricts() {
    return [
      {
        id: 'central',
        name: 'Distrito Central',
        bounds: { minX: 2, minY: 2, maxX: 34, maxY: 34 },
        theme: 'classic',
        lastThemeChange: 0,
        unlocked: true,
        unlockAtPopulation: 0,
        lotTarget: 4
      },
      {
        id: 'east',
        name: 'Distrito Este',
        bounds: { minX: 35, minY: 2, maxX: 62, maxY: 26 },
        theme: 'classic',
        lastThemeChange: 0,
        unlocked: false,
        unlockAtPopulation: 6,
        lotTarget: 3
      },
      {
        id: 'south',
        name: 'Distrito Sur',
        bounds: { minX: 20, minY: 35, maxX: 62, maxY: 62 },
        theme: 'classic',
        lastThemeChange: 0,
        unlocked: false,
        unlockAtPopulation: 10,
        lotTarget: 4
      },
      {
        id: 'west',
        name: 'Distrito Oeste',
        bounds: { minX: 2, minY: 30, maxX: 19, maxY: 62 },
        theme: 'classic',
        lastThemeChange: 0,
        unlocked: false,
        unlockAtPopulation: 14,
        lotTarget: 3
      }
    ];
  }

  initializeLots() {
    const lots = [];
    const central = this.districts.find(d => d.id === 'central');
    if (central) {
      lots.push(...this.generateLotsForDistrict(central, central.lotTarget));
    }
    return lots;
  }

  markBuildingFootprint(tiles, building) {
    if (building.type === 'plaza' || building.type === 'garden') return;
    for (let bx = building.x; bx < building.x + building.width; bx++) {
      for (let by = building.y; by < building.y + building.height; by++) {
        const key = `${bx},${by}`;
        if (tiles[key]) tiles[key].walkable = false;
      }
    }
  }

  tick() {
    this.tickCount++;
    this.updateWorldTime();
    this.updateWeather();
    this.expandCityIfNeeded();
    this.updateNeeds();
    // Progress all active movements
    this.movementState.forEach((state, agentId) => {
      if (state.fullPath && (!Array.isArray(state.fullPath) || typeof state.currentStep !== 'number')) {
        const agent = this.agents.get(agentId);
        if (agent) agent.state = 'idle';
        this.movementState.delete(agentId);
        return;
      }
      if (state.progress < 1) {
        state.progress += 0.2; // ~5 ticks per tile at 200ms tick = 1 second per tile
        if (state.progress >= 1) {
          state.progress = 1;
          const agent = this.agents.get(agentId);
          if (agent) {
            agent.x = state.toX;
            agent.y = state.toY;
            this.updateBuildingOccupancy(agentId, agent);
            if (state.fullPath && state.currentStep < state.fullPath.length - 1) {
              const nextStep = state.fullPath[state.currentStep + 1];
              state.fromX = agent.x;
              state.fromY = agent.y;
              state.toX = nextStep.x;
              state.toY = nextStep.y;
              state.progress = 0;
              state.currentStep += 1;

              const dx = state.toX - state.fromX;
              const dy = state.toY - state.fromY;
              if (Math.abs(dx) > Math.abs(dy)) agent.facing = dx > 0 ? 'right' : 'left';
              else agent.facing = dy > 0 ? 'down' : 'up';
            } else {
              if (state.enterBuildingId && agent) {
                const b = this.buildings.find(x => x.id === state.enterBuildingId);
                if (b) {
                  b.occupancy = b.occupancy.filter(id => id !== agentId);
                  b.occupancy.push(agentId);
                  agent.currentBuilding = b.id;
                }
              }
              agent.state = 'idle';
              this.movementState.delete(agentId);
            }
          }
        }
      }
    });
  }

  initializeNeeds() {
    return {
      hunger: 20,
      energy: 100,
      social: 60,
      fun: 60
    };
  }

  updateNeeds() {
    const now = Date.now();
    const deltaMinutes = (now - this.lastNeedUpdate) / 60000;
    if (deltaMinutes <= 0) return;
    this.lastNeedUpdate = now;

    for (const agent of this.agents.values()) {
      if (!agent.needs) {
        agent.needs = this.initializeNeeds();
      }
      agent.needs.hunger = this.clamp(agent.needs.hunger + deltaMinutes * this.needRates.hungerPerMinute, 0, 100);
      agent.needs.energy = this.clamp(agent.needs.energy - deltaMinutes * this.needRates.energyPerMinute, 0, 100);
      agent.needs.social = this.clamp(agent.needs.social - deltaMinutes * this.needRates.socialPerMinute, 0, 100);
      agent.needs.fun = this.clamp(agent.needs.fun - deltaMinutes * this.needRates.funPerMinute, 0, 100);
    }
  }

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  expandCityIfNeeded() {
    const now = this.tickCount;
    if (now - this.lastExpansionCheck < 50) return;
    this.lastExpansionCheck = now;
    const population = this.agents.size;
    const lockedDistrict = this.districts.find(d => !d.unlocked && population >= d.unlockAtPopulation);
    if (!lockedDistrict) return;

    lockedDistrict.unlocked = true;
    const newLots = this.generateLotsForDistrict(lockedDistrict, lockedDistrict.lotTarget);
    if (newLots.length) {
      this.lots.push(...newLots);
      logger.info(`District unlocked: ${lockedDistrict.id} with ${newLots.length} new lots`);
    }
  }

  generateLotsForDistrict(district, count) {
    const lots = [];
    let attempts = 0;
    while (lots.length < count && attempts < 200) {
      attempts++;
      const width = 3;
      const height = 3;
      const x = this.randomInRange(district.bounds.minX, district.bounds.maxX - width);
      const y = this.randomInRange(district.bounds.minY, district.bounds.maxY - height);
      if (!this.isLotAreaAvailable(x, y, width, height)) continue;
      const lot = {
        id: `lot-${district.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        x,
        y,
        width,
        height,
        district: district.id
      };
      lots.push(lot);
    }
    return lots;
  }

  isLotAreaAvailable(x, y, width, height) {
    const existingLots = this.lots || [];
    for (let bx = x; bx < x + width; bx++) {
      for (let by = y; by < y + height; by++) {
        if (!this.isWalkable(bx, by)) return false;
        if (this.getBuildingAt(bx, by)) return false;
        if (existingLots.some(lot => bx >= lot.x && bx < lot.x + lot.width && by >= lot.y && by < lot.y + lot.height)) {
          return false;
        }
      }
    }
    return true;
  }

  randomInRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  getCurrentTick() {
    return this.tickCount;
  }

  updateWorldTime() {
    const elapsed = Date.now() - this.worldStart;
    const progress = (elapsed % this.dayLengthMs) / this.dayLengthMs;
    this.worldTime = {
      dayProgress: progress,
      phase: this.getTimePhase(progress)
    };
  }

  getTimePhase(progress) {
    if (progress < 0.25) return 'morning';
    if (progress < 0.5) return 'afternoon';
    if (progress < 0.75) return 'evening';
    return 'night';
  }

  updateWeather() {
    const now = Date.now();
    if (now - this.weatherState.lastChange < this.weatherChangeMs) return;
    const weatherOptions = ['clear', 'rain', 'snow', 'storm'];
    const next = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
    this.weatherState = {
      current: next,
      lastChange: now
    };
  }

  getTimeState() {
    if (!this.worldTime) {
      this.updateWorldTime();
    }
    return this.worldTime;
  }

  getWeatherState() {
    return this.weatherState;
  }

  addAgent(agentId, position) {
    this.agents.set(agentId, {
      id: agentId,
      x: position.x,
      y: position.y,
      facing: 'down',
      state: 'idle',
      currentBuilding: null,
      needs: this.initializeNeeds(),
      lastUpdate: Date.now()
    });
    logger.debug(`Agent ${agentId} added at (${position.x}, ${position.y})`);
  }

  removeAgent(agentId) {
    this.agents.delete(agentId);
    this.movementState.delete(agentId);
    this.buildings.forEach(building => {
      building.occupancy = building.occupancy.filter(id => id !== agentId);
    });
    logger.debug(`Agent ${agentId} removed`);
  }

  // ── A* Pathfinding ──
  findPath(startX, startY, endX, endY) {
    const open = [{ x: startX, y: startY, g: 0, h: 0, f: 0, parent: null }];
    const closed = new Set();
    const dirs = [
      { x: 0, y: -1 }, { x: 0, y: 1 },
      { x: -1, y: 0 }, { x: 1, y: 0 },
      { x: 1, y: -1 }, { x: -1, y: -1 },
      { x: 1, y: 1 },  { x: -1, y: 1 }
    ];

    const heuristic = (x, y) => {
      const dx = Math.abs(x - endX);
      const dy = Math.abs(y - endY);
      const min = Math.min(dx, dy);
      const max = Math.max(dx, dy);
      return (1.414 * min) + (max - min);
    };
    open[0].h = heuristic(startX, startY);
    open[0].f = open[0].h;

    let iterations = 0;
    const maxIterations = 1200;
    while (open.length > 0 && iterations < maxIterations) {
      iterations++;
      // Find node with lowest f
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open.splice(bestIdx, 1)[0];
      const key = `${current.x},${current.y}`;

      if (current.x === endX && current.y === endY) {
        // Reconstruct path
        const path = [];
        let node = current;
        while (node) {
          path.unshift({ x: node.x, y: node.y });
          node = node.parent;
        }
        return path;
      }

      closed.add(key);

      for (const dir of dirs) {
        const nx = current.x + dir.x;
        const ny = current.y + dir.y;
        const nKey = `${nx},${ny}`;

        if (closed.has(nKey)) continue;
        if (!this.isWalkable(nx, ny)) continue;

        const isDiagonal = dir.x !== 0 && dir.y !== 0;
        if (isDiagonal) {
          const sideA = this.isWalkable(current.x + dir.x, current.y);
          const sideB = this.isWalkable(current.x, current.y + dir.y);
          if (!sideA || !sideB) continue;
        }
        const moveCost = isDiagonal ? 1.414 : 1;
        const g = current.g + moveCost;
        const h = heuristic(nx, ny);

        const existing = open.find(n => n.x === nx && n.y === ny);
        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = g + h;
            existing.parent = current;
          }
        } else {
          open.push({ x: nx, y: ny, g, h, f: g + h, parent: current });
        }
      }
    }
    return null; // No path found
  }

  // ── Smooth Movement: queue a full path ──
  moveAgentTo(agentId, targetX, targetY) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    let finalTargetX = targetX;
    let finalTargetY = targetY;
    let enterBuildingId = null;

    // If target is inside a non-walkable building, route to its entrance instead
    const targetBuilding = this.getBuildingAt(targetX, targetY);
    if (targetBuilding && targetBuilding.type !== 'plaza' && targetBuilding.type !== 'garden') {
      enterBuildingId = targetBuilding.id;
      const entranceX = targetBuilding.x + Math.floor(targetBuilding.width / 2);
      const entranceY = targetBuilding.y + targetBuilding.height; // door at bottom
      finalTargetX = entranceX;
      finalTargetY = entranceY;
    }

    if (!this.isWalkable(finalTargetX, finalTargetY)) {
      const fallback = this.findNearestWalkable(finalTargetX, finalTargetY, 6, agentId);
      if (fallback) {
        finalTargetX = fallback.x;
        finalTargetY = fallback.y;
      } else {
        throw new Error(`Target (${targetX}, ${targetY}) is not walkable`);
      }
    }
    if (this.isOccupied(finalTargetX, finalTargetY, agentId)) {
      const fallback2 = this.findNearestWalkable(finalTargetX, finalTargetY, 6, agentId);
      if (fallback2) {
        finalTargetX = fallback2.x;
        finalTargetY = fallback2.y;
      } else {
        return { success: false, reason: 'Target occupied' };
      }
    }

    const path = this.findPath(agent.x, agent.y, finalTargetX, finalTargetY);
    if (!path || path.length < 2) return { success: false, reason: 'No path found' };

    this.movementState.set(agentId, {
      fromX: agent.x,
      fromY: agent.y,
      toX: path[1].x,
      toY: path[1].y,
      progress: 0,
      fullPath: path,
      currentStep: 1,
      enterBuildingId
    });

    // Update facing
    const dx = path[1].x - agent.x;
    const dy = path[1].y - agent.y;
    if (Math.abs(dx) > Math.abs(dy)) agent.facing = dx > 0 ? 'right' : 'left';
    else agent.facing = dy > 0 ? 'down' : 'up';

    agent.state = 'moving';
    return {
      success: true,
      path,
      target: { x: finalTargetX, y: finalTargetY }
    };
  }

  // Legacy single-step move (still supported)
  moveAgent(agentId, targetX, targetY) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    if (!this.isWalkable(targetX, targetY)) throw new Error(`Position (${targetX}, ${targetY}) is not walkable`);
    if (this.isOccupied(targetX, targetY, agentId)) throw new Error(`Position occupied`);

    const oldX = agent.x, oldY = agent.y;

    // Set up interpolation for smooth movement
    this.movementState.set(agentId, {
      fromX: oldX, fromY: oldY,
      toX: targetX, toY: targetY,
      progress: 0,
      fullPath: null,
      currentStep: 0
    });

    if (targetX > oldX) agent.facing = 'right';
    else if (targetX < oldX) agent.facing = 'left';
    else if (targetY > oldY) agent.facing = 'down';
    else if (targetY < oldY) agent.facing = 'up';

    agent.state = 'moving';
    return { x: targetX, y: targetY, facing: agent.facing };
  }

  getAgentInterpolatedPosition(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    const state = this.movementState.get(agentId);
    if (!state || state.progress >= 1) {
      return { x: agent.x, y: agent.y, facing: agent.facing, progress: 1 };
    }
    return {
      x: state.fromX + (state.toX - state.fromX) * state.progress,
      y: state.fromY + (state.toY - state.fromY) * state.progress,
      facing: agent.facing,
      progress: state.progress
    };
  }

  isWalkable(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    const tile = this.tiles[`${x},${y}`];
    return tile && tile.walkable;
  }

  isOccupied(x, y, excludeAgentId = null) {
    for (const [id, agent] of this.agents) {
      if (id !== excludeAgentId && agent.x === x && agent.y === y) return true;
    }
    return false;
  }

  updateBuildingOccupancy(agentId, agent) {
    this.buildings.forEach(building => {
      building.occupancy = building.occupancy.filter(id => id !== agentId);
    });
    const building = this.getBuildingAt(agent.x, agent.y);
    if (building) {
      building.occupancy.push(agentId);
      agent.currentBuilding = building.id;
    } else {
      agent.currentBuilding = null;
    }
  }

  getBuildingAt(x, y) {
    return this.buildings.find(b =>
      x >= b.x && x < b.x + b.width &&
      y >= b.y && y < b.y + b.height
    );
  }

  getAgentPosition(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    return { x: agent.x, y: agent.y, facing: agent.facing };
  }

  getAgentMovementState(agentId) {
    const state = this.movementState.get(agentId);
    if (!state) return null;
    return {
      fromX: state.fromX,
      fromY: state.fromY,
      toX: state.toX,
      toY: state.toY,
      progress: state.progress,
      fullPath: state.fullPath || null,
      currentStep: typeof state.currentStep === 'number' ? state.currentStep : null
    };
  }

  findNearestWalkable(targetX, targetY, maxRadius = 2, excludeAgentId = null) {
    for (let radius = 1; radius <= maxRadius; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
          const candidateX = targetX + dx;
          const candidateY = targetY + dy;
          if (!this.isWalkable(candidateX, candidateY)) continue;
          if (this.isOccupied(candidateX, candidateY, excludeAgentId)) continue;
          return { x: candidateX, y: candidateY };
        }
      }
    }
    return null;
  }

  getAllAgentPositions() {
    const positions = {};
    for (const [id, agent] of this.agents) {
      const interp = this.getAgentInterpolatedPosition(id);
      positions[id] = {
        x: interp ? interp.x : agent.x,
        y: interp ? interp.y : agent.y,
        facing: agent.facing,
        state: agent.state,
        currentBuilding: agent.currentBuilding,
        progress: interp ? interp.progress : 1
      };
    }
    return positions;
  }

  getAgentsInRadius(position, radius) {
    const nearbyAgents = [];
    for (const [id, agent] of this.agents) {
      const distance = this.getDistance(position, { x: agent.x, y: agent.y });
      if (distance <= radius) nearbyAgents.push(id);
    }
    return nearbyAgents;
  }

  getDistance(pos1, pos2) {
    if (!pos1 || !pos2 || typeof pos1.x !== 'number' || typeof pos2.x !== 'number') {
      return Infinity;
    }
    return Math.sqrt((pos1.x - pos2.x) ** 2 + (pos1.y - pos2.y) ** 2);
  }

  getAgentView(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    const viewRadius = 10;
    const nearbyAgents = this.getAgentsInRadius({ x: agent.x, y: agent.y }, viewRadius)
      .filter(id => id !== agentId);

    const currentBuilding = agent.currentBuilding ?
      this.buildings.find(b => b.id === agent.currentBuilding) : null;

    return {
      position: { x: agent.x, y: agent.y, facing: agent.facing },
      currentBuilding: currentBuilding ? {
        id: currentBuilding.id, name: currentBuilding.name,
        type: currentBuilding.type, occupants: currentBuilding.occupancy.length
      } : null,
      nearbyAgents: nearbyAgents.map(id => {
        const a = this.agents.get(id);
        return {
          id,
          name: a.name || id,
          distance: this.getDistance({ x: agent.x, y: agent.y }, { x: a.x, y: a.y }),
          position: { x: a.x, y: a.y },
          state: a.state,
          occupation: a.occupation || null
        };
      }),
      nearbyBuildings: this.buildings.filter(b => {
        const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        return this.getDistance({ x: agent.x, y: agent.y }, { x: cx, y: cy }) <= viewRadius;
      }).map(b => ({
        id: b.id, name: b.name, type: b.type,
        position: { x: b.x, y: b.y }, width: b.width, height: b.height,
        occupants: b.occupancy.length
      })),
      needs: agent.needs,
      suggestedGoals: this.getSuggestedGoals(agent),
      worldTime: this.getTimeState(),
      weather: this.getWeatherState()
    };
  }

  getSuggestedGoals(agent) {
    if (!agent.needs) return [];
    const suggestions = [];
    const { hunger, energy, social, fun } = agent.needs;

    if (hunger >= this.needThresholds.hunger) {
      suggestions.push({
        type: 'eat',
        urgency: hunger,
        reason: 'high_hunger',
        targetTypes: ['cafe', 'market', 'shop', 'inn']
      });
    }
    if (energy <= this.needThresholds.energy) {
      suggestions.push({
        type: 'rest',
        urgency: 100 - energy,
        reason: 'low_energy',
        targetTypes: ['inn', 'house', 'apartment']
      });
    }
    if (social <= this.needThresholds.social) {
      suggestions.push({
        type: 'socialize',
        urgency: 100 - social,
        reason: 'low_social',
        targetTypes: ['plaza', 'cafe', 'market', 'garden']
      });
    }
    if (fun <= this.needThresholds.fun) {
      suggestions.push({
        type: 'relax',
        urgency: 100 - fun,
        reason: 'low_fun',
        targetTypes: ['garden', 'plaza', 'gallery', 'park']
      });
    }

    return suggestions
      .sort((a, b) => b.urgency - a.urgency)
      .slice(0, 3)
      .map(({ urgency, ...entry }) => entry);
  }

  getRandomSpawnPosition() {
    const spawnAreas = [
      { minX: 11, maxX: 13, minY: 11, maxY: 13 },
      { minX: 25, maxX: 27, minY: 11, maxY: 13 },
      { minX: 11, maxX: 13, minY: 25, maxY: 27 },
      { minX: 25, maxX: 27, minY: 25, maxY: 27 },
    ];
    const area = spawnAreas[Math.floor(Math.random() * spawnAreas.length)];
    let attempts = 0, x, y;
    do {
      x = Math.floor(Math.random() * (area.maxX - area.minX + 1)) + area.minX;
      y = Math.floor(Math.random() * (area.maxY - area.minY + 1)) + area.minY;
      attempts++;
    } while ((!this.isWalkable(x, y) || this.isOccupied(x, y)) && attempts < 100);
    return attempts >= 100 ? { x: 12, y: 12 } : { x, y };
  }

  getFullState() {
    return {
      width: this.width, height: this.height, tileSize: this.tileSize,
      buildings: this.buildings,
      lots: this.lots,
      districts: this.districts,
      agents: this.getAllAgentPositions(),
      tick: this.tickCount,
      worldTime: this.getTimeState(),
      weather: this.getWeatherState()
    };
  }

  createSnapshot() {
    return {
      version: 1,
      createdAt: Date.now(),
      world: {
        width: this.width,
        height: this.height,
        tileSize: this.tileSize,
        tickCount: this.tickCount,
        worldStart: this.worldStart,
        dayLengthMs: this.dayLengthMs,
        weatherChangeMs: this.weatherChangeMs,
        weatherState: this.weatherState,
        worldTime: this.getTimeState(),
        lastNeedUpdate: this.lastNeedUpdate,
        lastExpansionCheck: this.lastExpansionCheck,
        needRates: { ...this.needRates },
        needThresholds: { ...this.needThresholds }
      },
      buildings: this.buildings,
      lots: this.lots,
      districts: this.districts,
      agents: Array.from(this.agents.values()).map(agent => ({
        id: agent.id,
        x: agent.x,
        y: agent.y,
        facing: agent.facing,
        state: agent.state,
        currentBuilding: agent.currentBuilding,
        needs: agent.needs,
        lastUpdate: agent.lastUpdate
      })),
      movementState: Array.from(this.movementState.entries()).map(([agentId, state]) => ({
        agentId,
        ...state
      }))
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Snapshot inválido');
    }
    if (snapshot.version && snapshot.version !== 1) {
      throw new Error(`Snapshot versión no soportada: ${snapshot.version}`);
    }
    const world = snapshot.world || {};
    this.width = world.width || this.width;
    this.height = world.height || this.height;
    this.tileSize = world.tileSize || this.tileSize;
    this.tickCount = world.tickCount || 0;
    this.worldStart = world.worldStart || Date.now();
    this.dayLengthMs = world.dayLengthMs || this.dayLengthMs;
    this.weatherChangeMs = world.weatherChangeMs || this.weatherChangeMs;
    this.weatherState = world.weatherState || this.weatherState;
    this.worldTime = world.worldTime || this.worldTime;
    this.lastNeedUpdate = Number(world.lastNeedUpdate ?? this.lastNeedUpdate);
    this.lastExpansionCheck = Number(world.lastExpansionCheck ?? this.lastExpansionCheck);
    if (world.needRates) {
      this.needRates = { ...this.needRates, ...world.needRates };
    }
    if (world.needThresholds) {
      this.needThresholds = { ...this.needThresholds, ...world.needThresholds };
    }

    this.buildings = (snapshot.buildings || this.initializeBuildings()).map(building => ({
      ...building,
      occupancy: Array.isArray(building.occupancy) ? [...building.occupancy] : []
    }));
    this.districts = snapshot.districts || this.initializeDistricts();
    this.lots = snapshot.lots || [];
    this.tiles = this.initializeTiles();

    this.agents = new Map();
    (snapshot.agents || []).forEach(agent => {
      this.agents.set(agent.id, {
        id: agent.id,
        x: agent.x,
        y: agent.y,
        facing: agent.facing || 'down',
        state: agent.state || 'idle',
        currentBuilding: agent.currentBuilding || null,
        needs: agent.needs || this.initializeNeeds(),
        lastUpdate: agent.lastUpdate || Date.now()
      });
    });

    this.buildings.forEach(building => {
      building.occupancy = [];
    });
    for (const agent of this.agents.values()) {
      const building = this.getBuildingAt(agent.x, agent.y);
      if (building) {
        building.occupancy.push(agent.id);
        agent.currentBuilding = building.id;
      } else {
        agent.currentBuilding = null;
      }
    }

    this.movementState = new Map();
    (snapshot.movementState || []).forEach(state => {
      if (!state || !state.agentId) return;
      if (!this.agents.has(state.agentId)) return;
      const { agentId, ...rest } = state;
      this.movementState.set(agentId, { ...rest });
    });

    if (!Number.isFinite(this.lastNeedUpdate)) {
      this.lastNeedUpdate = Date.now();
    }
    if (!Number.isFinite(this.lastExpansionCheck)) {
      this.lastExpansionCheck = 0;
    }
  }

  addBuildingFromLot(building) {
    const lotIndex = this.lots.findIndex(lot => lot.id === building.lotId);
    if (lotIndex === -1) {
      throw new Error('Lot not available');
    }
    const lot = this.lots[lotIndex];
    const created = {
      id: building.id,
      name: building.name,
      type: building.type,
      x: lot.x,
      y: lot.y,
      width: lot.width,
      height: lot.height,
      occupancy: []
    };
    this.buildings.push(created);
    this.lots.splice(lotIndex, 1);
    this.markBuildingFootprint(this.tiles, created);
    return created;
  }

  updateAgentState(agentId, state) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.state = state;
      agent.lastUpdate = Date.now();
    }
  }

  setDistrictTheme(districtId, theme) {
    const district = this.districts.find(entry => entry.id === districtId);
    if (!district) {
      throw new Error(`District not found: ${districtId}`);
    }
    district.theme = theme;
    district.lastThemeChange = Date.now();
    return district;
  }
}

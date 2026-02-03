import { logger } from '../utils/logger.js';

export class WorldStateManager {
  constructor(options = {}) {
    const {
      tickRateMs = 100,
      dayLengthMs = 2 * 60 * 60 * 1000,
      weatherChangeMs = 6 * 60 * 60 * 1000
    } = options;
    this.tickCount = 0;
    this.agents = new Map();
    this.buildings = this.initializeBuildings();
    this.tiles = this.initializeTiles();
    this.width = 64;
    this.height = 64;
    this.tileSize = 32;
    this.tickRateMs = tickRateMs;
    this.dayLengthMs = dayLengthMs;
    this.weatherChangeMs = weatherChangeMs;
    this.timeState = {
      dayCount: 1,
      timeMs: 0,
      timeOfDay: 'morning'
    };
    this.weatherState = {
      current: 'clear',
      lastChangeMs: 0
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
      this.buildings.forEach(b => {
        if (b.type === 'plaza' || b.type === 'garden') return;
        for (let bx = b.x; bx < b.x + b.width; bx++) {
          for (let by = b.y; by < b.y + b.height; by++) {
            const key = `${bx},${by}`;
            if (tiles[key]) tiles[key].walkable = false;
          }
        }
      });
    }

    return tiles;
  }

  tick() {
    this.tickCount++;
    this.updateTimeAndWeather();
    // Progress all active movements
    this.movementState.forEach((state, agentId) => {
      if (state.progress < 1) {
        state.progress += 0.05; // ~20 ticks per tile at 100ms tick = 2 seconds per tile
        if (state.progress >= 1) {
          state.progress = 1;
          const agent = this.agents.get(agentId);
          if (agent) {
            agent.x = state.toX;
            agent.y = state.toY;
            this.updateBuildingOccupancy(agentId, agent);
          }
        }
      }
    });
  }

  updateTimeAndWeather() {
    this.timeState.timeMs += this.tickRateMs;
    if (this.timeState.timeMs >= this.dayLengthMs) {
      this.timeState.timeMs -= this.dayLengthMs;
      this.timeState.dayCount += 1;
    }

    const dayProgress = this.timeState.timeMs / this.dayLengthMs;
    if (dayProgress < 0.25) this.timeState.timeOfDay = 'morning';
    else if (dayProgress < 0.5) this.timeState.timeOfDay = 'afternoon';
    else if (dayProgress < 0.75) this.timeState.timeOfDay = 'evening';
    else this.timeState.timeOfDay = 'night';

    this.weatherState.lastChangeMs += this.tickRateMs;
    if (this.weatherState.lastChangeMs >= this.weatherChangeMs) {
      this.weatherState.current = this.getNextWeather();
      this.weatherState.lastChangeMs = 0;
    }
  }

  getNextWeather() {
    const options = [
      { type: 'clear', weight: 50 },
      { type: 'cloudy', weight: 20 },
      { type: 'rain', weight: 15 },
      { type: 'storm', weight: 5 },
      { type: 'snow', weight: 5 },
      { type: 'fog', weight: 5 }
    ];
    const total = options.reduce((sum, o) => sum + o.weight, 0);
    let roll = Math.random() * total;
    for (const option of options) {
      roll -= option.weight;
      if (roll <= 0) return option.type;
    }
    return 'clear';
  }

  getCurrentTick() {
    return this.tickCount;
  }

  addAgent(agentId, position) {
    this.agents.set(agentId, {
      id: agentId,
      x: position.x,
      y: position.y,
      facing: 'down',
      state: 'idle',
      currentBuilding: null,
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

    const heuristic = (x, y) => Math.abs(x - endX) + Math.abs(y - endY);
    open[0].h = heuristic(startX, startY);
    open[0].f = open[0].h;

    let iterations = 0;
    while (open.length > 0 && iterations < 500) {
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
    if (!this.isWalkable(targetX, targetY)) throw new Error(`Target (${targetX}, ${targetY}) is not walkable`);

    const path = this.findPath(agent.x, agent.y, targetX, targetY);
    if (!path || path.length < 2) return { success: false, reason: 'No path found' };

    this.movementState.set(agentId, {
      fromX: agent.x,
      fromY: agent.y,
      toX: path[1].x,
      toY: path[1].y,
      progress: 0,
      fullPath: path,
      currentStep: 1
    });

    // Update facing
    const dx = path[1].x - agent.x;
    const dy = path[1].y - agent.y;
    if (Math.abs(dx) > Math.abs(dy)) agent.facing = dx > 0 ? 'right' : 'left';
    else agent.facing = dy > 0 ? 'down' : 'up';

    agent.state = 'moving';
    return { success: true, path };
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
      world: {
        dayCount: this.timeState.dayCount,
        timeOfDay: this.timeState.timeOfDay,
        weather: this.weatherState.current
      },
      currentBuilding: currentBuilding ? {
        id: currentBuilding.id, name: currentBuilding.name,
        type: currentBuilding.type, occupants: currentBuilding.occupancy.length
      } : null,
      nearbyAgents: nearbyAgents.map(id => {
        const a = this.agents.get(id);
        return {
          id, distance: this.getDistance({ x: agent.x, y: agent.y }, { x: a.x, y: a.y }),
          position: { x: a.x, y: a.y }, state: a.state
        };
      }),
      nearbyBuildings: this.buildings.filter(b => {
        const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        return this.getDistance({ x: agent.x, y: agent.y }, { x: cx, y: cy }) <= viewRadius;
      }).map(b => ({
        id: b.id, name: b.name, type: b.type,
        position: { x: b.x, y: b.y }, occupants: b.occupancy.length
      }))
    };
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
      agents: this.getAllAgentPositions(),
      tick: this.tickCount,
      world: {
        dayCount: this.timeState.dayCount,
        timeOfDay: this.timeState.timeOfDay,
        weather: this.weatherState.current
      }
    };
  }

  updateAgentState(agentId, state) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.state = state;
      agent.lastUpdate = Date.now();
    }
  }
}

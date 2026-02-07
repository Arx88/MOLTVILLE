import { logger } from '../utils/logger.js';

export class ActionQueue {
  constructor(worldState, moltbotRegistry) {
    this.worldState = worldState;
    this.moltbotRegistry = moltbotRegistry;
    this.queue = [];
    this.processing = false;
  }

  async enqueue(action) {
    this.queue.push(action);
    logger.debug(`Action enqueued: ${action.type} from ${action.agentId}`);
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const action = this.queue.shift();
      try {
        await this.processAction(action);
      } catch (error) {
        logger.error(`Action processing error:`, error);
      }
    }
    this.processing = false;
  }

  async processAction(action) {
    const { type, agentId } = action;
    const agent = this.moltbotRegistry.getAgent(agentId);
    if (!agent) { logger.warn(`Action from unknown agent: ${agentId}`); return; }

    switch (type) {
      case 'MOVE':       await this.processMove(action, agent); break;
      case 'MOVE_TO':    await this.processMoveToTarget(action, agent); break;
      case 'ACTION':     await this.processInteraction(action, agent); break;
      default:           logger.warn(`Unknown action type: ${type}`);
    }
  }

  // ── Single-step adjacent move (legacy, still works) ──
  async processMove(action, agent) {
    const { targetX, targetY } = action;
    try {
      const currentPos = this.worldState.getAgentPosition(agent.id);
      const dx = Math.abs(targetX - currentPos.x);
      const dy = Math.abs(targetY - currentPos.y);

      if (dx + dy > 2 || (dx + dy === 0)) {
        logger.warn(`Invalid single-step move for ${agent.name}`);
        return;
      }

      this.worldState.moveAgent(agent.id, targetX, targetY);
      this.moltbotRegistry.updateAgentActivity(agent.id, 'action');

      const building = this.worldState.getBuildingAt(targetX, targetY);
      if (building) {
        this.moltbotRegistry.addMemory(agent.id, 'location', {
          buildingId: building.id,
          building: building.name,
          buildingType: building.type,
          action: 'entered'
        });
      }
      logger.debug(`${agent.name} moved to (${targetX}, ${targetY})`);
    } catch (error) {
      logger.error(`Move failed for ${agent.name}: ${error.message}`);
    }
  }

  // ── Full pathfinding move: agent says "go to (x,y)" and A* finds the way ──
  async processMoveToTarget(action, agent) {
    const { targetX, targetY } = action;
    try {
      const result = this.worldState.moveAgentTo(agent.id, targetX, targetY);
      if (result.success) {
        this.moltbotRegistry.updateAgentActivity(agent.id, 'action');
        logger.info(`${agent.name} pathfinding to (${targetX}, ${targetY}) — ${result.path.length} steps`);
      } else {
        logger.warn(`Pathfinding failed for ${agent.name}: ${result.reason}`);
      }
    } catch (error) {
      logger.error(`MoveToTarget failed for ${agent.name}: ${error.message}`);
    }
  }

  async processInteraction(action, agent) {
    const { actionType, target, params } = action;
    try {
      switch (actionType) {
        case 'enter_building':    await this.handleEnterBuilding(agent, target); break;
        case 'leave_building':    await this.handleLeaveBuilding(agent); break;
        case 'interact_object':   await this.handleObjectInteraction(agent, target, params); break;
        case 'greet':             await this.handleGreeting(agent, target); break;
        default:                  logger.warn(`Unknown interaction: ${actionType}`);
      }
      this.moltbotRegistry.updateAgentActivity(agent.id, 'interaction');
    } catch (error) {
      logger.error(`Interaction failed for ${agent.name}: ${error.message}`);
    }
  }

  async handleEnterBuilding(agent, buildingId) {
    const building = this.worldState.buildings.find(b => b.id === buildingId);
    if (!building) throw new Error(`Building ${buildingId} not found`);

    const agentPos = this.worldState.getAgentPosition(agent.id);
    const distance = this.worldState.getDistance(
      agentPos,
      { x: building.x + building.width / 2, y: building.y + building.height / 2 }
    );

    if (distance > 4) {
      // Try to pathfind to the building entrance first
      const entranceX = building.x + Math.floor(building.width / 2);
      const entranceY = building.y + building.height; // door at bottom
      const result = this.worldState.moveAgentTo(agent.id, entranceX, entranceY);
      if (!result.success) throw new Error('Cannot reach building');
      logger.info(`${agent.name} pathfinding to ${building.name} entrance`);
      return;
    }

    this.moltbotRegistry.addMemory(agent.id, 'location', {
      buildingId: building.id,
      building: building.name,
      buildingType: building.type,
      action: 'entered'
    });
    logger.info(`${agent.name} entered ${building.name}`);
  }

  async handleLeaveBuilding(agent) {
    const agentData = this.worldState.agents.get(agent.id);
    if (agentData && agentData.currentBuilding) {
      const building = this.worldState.buildings.find(b => b.id === agentData.currentBuilding);
      if (building) {
        this.moltbotRegistry.addMemory(agent.id, 'location', {
          buildingId: building.id,
          building: building.name,
          buildingType: building.type,
          action: 'left'
        });
        logger.info(`${agent.name} left ${building.name}`);
      }
    }
  }

  async handleObjectInteraction(agent, objectId, params) {
    logger.info(`${agent.name} interacted with ${objectId}:`, params);
    this.moltbotRegistry.addMemory(agent.id, 'interaction', {
      type: 'object', objectId, params, result: 'success'
    });
  }

  async handleGreeting(agent, targetAgentId) {
    const targetAgent = this.moltbotRegistry.getAgent(targetAgentId);
    if (!targetAgent) throw new Error(`Target agent ${targetAgentId} not found`);

    this.moltbotRegistry.updateRelationship(agent.id, targetAgentId, 5);
    this.moltbotRegistry.updateRelationship(targetAgentId, agent.id, 5);
    this.moltbotRegistry.addMemory(agent.id, 'interaction', {
      type: 'greeting', with: targetAgent.name, withId: targetAgentId
    });
    logger.info(`${agent.name} greeted ${targetAgent.name}`);
  }

  getQueueLength() { return this.queue.length; }
  clearQueue() { this.queue = []; logger.info('Action queue cleared'); }

  createSnapshot() {
    return {
      queue: this.queue.map(action => ({ ...action }))
    };
  }

  loadSnapshot(snapshot) {
    if (!snapshot) return;
    this.queue = Array.isArray(snapshot.queue) ? snapshot.queue.map(action => ({ ...action })) : [];
    this.processing = false;
  }
}

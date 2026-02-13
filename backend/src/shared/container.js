import { AgentService } from '../application/AgentService.js';
import { ConversationService } from '../application/ConversationService.js';
import { WorldService } from '../application/WorldService.js';
import { EconomyService } from '../application/EconomyService.js';
import { EventService } from '../application/EventService.js';

export function createContainer(deps) {
  const services = {
    agentService: new AgentService(deps),
    conversationService: new ConversationService({
      interactionEngine: deps.interactionEngine,
      registry: deps.moltbotRegistry,
      io: deps.io,
      recordIntentSignal: deps.recordIntentSignal
    }),
    worldService: new WorldService(deps),
    economyService: new EconomyService(deps),
    eventService: new EventService(deps)
  };

  return {
    ...deps,
    services
  };
}

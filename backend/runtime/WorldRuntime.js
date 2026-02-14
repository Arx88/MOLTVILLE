import { buildDramaScore } from '../utils/analyticsStore.js';

export class WorldRuntime {
  constructor(options) {
    this.tickRate = Number(options.tickRate) || 200;
    this.logger = options.logger;
    this.runWithLogContext = options.runWithLogContext;
    this.coreFlags = options.coreFlags;
    this.telemetryService = options.telemetryService;
    this.tickIntegrityMonitor = options.tickIntegrityMonitor;
    this.worldState = options.worldState;
    this.actionQueue = options.actionQueue;
    this.moltbotRegistry = options.moltbotRegistry;
    this.policyEngine = options.policyEngine;
    this.economyManager = options.economyManager;
    this.votingManager = options.votingManager;
    this.governanceManager = options.governanceManager;
    this.favorLedger = options.favorLedger;
    this.reputationManager = options.reputationManager;
    this.cityMoodManager = options.cityMoodManager;
    this.aestheticsManager = options.aestheticsManager;
    this.eventManager = options.eventManager;
    this.npcSpawner = options.npcSpawner;
    this.eventScheduler = options.eventScheduler;
    this.healthMonitor = options.healthMonitor;
    this.microEventEngine = options.microEventEngine;
    this.interactionEngine = options.interactionEngine;
    this.agentAutonomyEngine = options.agentAutonomyEngine || null;
    this.analyticsStore = options.analyticsStore;
    this.metrics = options.metrics;
    this.recordTickDuration = options.recordTickDuration;
    this.recordTickEventCount = options.recordTickEventCount;
    this.emitEventGoals = options.emitEventGoals;
    this.applyEventIncentives = options.applyEventIncentives;
    this.applyEventLegacyMood = options.applyEventLegacyMood;
    this.realtimeGateway = options.realtimeGateway;
    this.analyticsIntervalMs = Number(options.analyticsIntervalMs) || 10000;

    this.lastAnalyticsRecord = 0;
    this.intervalId = null;
  }

  start() {
    if (this.intervalId) {
      return;
    }
    this.intervalId = setInterval(() => this.tick(), this.tickRate);
  }

  stop() {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  tick() {
    const tickStart = Date.now();
    const tickId = this.worldState.getCurrentTick() + 1;
    const correlationId = `tick-${tickId}-${Date.now()}`;

    this.runWithLogContext({
      tick_id: tickId,
      correlation_id: correlationId,
      request_id: null
    }, () => {
      const isTelemetryEnabled = this.coreFlags.isEnabled('telemetry.enabled');
      const trackManagerTick = (manager, callback) => {
        const managerStart = Date.now();
        const result = callback();
        if (isTelemetryEnabled) {
          const durationMetric = manager === 'economy' ? 'tick_duration' : 'tick_duration_ms';
          this.telemetryService.trackManagerMetric(manager, durationMetric, Date.now() - managerStart, {
            tickId,
            correlationId,
            manager,
            log: false
          });
        }
        return result;
      };

      if (this.coreFlags.isEnabled('tick.snapshot.enabled')) {
        this.tickIntegrityMonitor.startTick(tickId, {
          tick: this.worldState.getCurrentTick(),
          agents: this.worldState.getAllAgentPositions(),
          events: this.eventManager.getSummary()
        }, correlationId);
      }

      trackManagerTick('world_state', () => this.worldState.tick());
      const queueBefore = this.actionQueue.getQueueLength ? this.actionQueue.getQueueLength() : 0;
      trackManagerTick('action_queue', () => this.actionQueue.processQueue());
      const queueAfter = this.actionQueue.getQueueLength ? this.actionQueue.getQueueLength() : 0;
      trackManagerTick('registry', () => this.moltbotRegistry.pruneMemories());
      trackManagerTick('policy', () => this.policyEngine.applyActivePolicies());
      trackManagerTick('economy', () => this.economyManager.tick());
      trackManagerTick('voting', () => this.votingManager.tick());
      trackManagerTick('governance', () => this.governanceManager.tick(this.moltbotRegistry.getAgentCount()));
      trackManagerTick('favor_ledger', () => this.favorLedger.applyTick({
        reputationManager: this.reputationManager,
        moltbotRegistry: this.moltbotRegistry
      }));
      trackManagerTick('city_mood', () => this.cityMoodManager.tick());
      trackManagerTick('aesthetics', () => this.aestheticsManager.tick(this.moltbotRegistry.getAgentCount()));
      const eventTransitions = trackManagerTick('events', () => this.eventManager.tick());
      trackManagerTick('npc_spawner', () => this.npcSpawner.tick());
      trackManagerTick('event_scheduler', () => this.eventScheduler.tick());
      trackManagerTick('health', () => this.healthMonitor.tick());
      if (this.microEventEngine) {
        trackManagerTick('micro_events', () => this.microEventEngine.tick());
      }
      trackManagerTick('interaction', () => this.interactionEngine.cleanupOldConversations());
      if (this.agentAutonomyEngine) {
        trackManagerTick('autonomy_engine', () => this.agentAutonomyEngine.tick());
      }

      const processedActions = Math.max(0, queueBefore - queueAfter);
      const processedEvents = processedActions + (Array.isArray(eventTransitions) ? eventTransitions.length : 0);
      this.recordTickEventCount(processedEvents);
      if (eventTransitions?.length) {
        this.emitEventGoals(eventTransitions);
      }
      this.applyEventIncentives(eventTransitions);
      this.applyEventLegacyMood(eventTransitions);

      const now = Date.now();
      if (now - this.lastAnalyticsRecord >= this.analyticsIntervalMs) {
        const mood = this.cityMoodManager.getSummary();
        const activeEvents = this.eventManager.getSummary().filter((event) => event.status === 'active').length;
        const dramaScore = buildDramaScore({
          mood,
          activeEvents,
          npcDramaPoints: this.metrics.npc.dramaPoints
        });
        this.analyticsStore.record(dramaScore);
        this.lastAnalyticsRecord = now;
      }

      if (this.worldState.tickCount % 100 === 0) {
        this.logger.info(`World tick ${this.worldState.tickCount} - Agents: ${Object.keys(this.worldState.getAllAgentPositions()).length}`);
      }

      this.realtimeGateway.emitToViewers('world:tick', {
        tick: this.worldState.getCurrentTick(),
        agents: this.worldState.getAllAgentPositions(),
        worldTime: this.worldState.getTimeState(),
        weather: this.worldState.getWeatherState(),
        vote: this.votingManager.getVoteSummary(),
        governance: this.governanceManager.getSummary(),
        mood: this.cityMoodManager.getSummary(),
        events: this.eventManager.getSummary(),
        aesthetics: this.aestheticsManager.getVoteSummary(),
        conversations: this.interactionEngine.getActiveConversations()
      });

      if (this.coreFlags.isEnabled('tick.snapshot.enabled')) {
        this.tickIntegrityMonitor.finishTick(tickId, {
          tick: this.worldState.getCurrentTick(),
          agents: this.worldState.getAllAgentPositions(),
          events: this.eventManager.getSummary()
        }, correlationId);
      }

      const tickDuration = Date.now() - tickStart;
      if (isTelemetryEnabled) {
        const governanceSummary = this.governanceManager.getSummary();
        const governanceVotes = (governanceSummary?.election?.candidates || [])
          .reduce((sum, candidate) => sum + Number(candidate?.votes || 0), 0);
        const governanceEventCount =
          Number(governanceSummary?.policies?.length || 0)
          + Number(governanceSummary?.election?.candidates?.length || 0)
          + governanceVotes;
        const interactionCount = this.interactionEngine.getActiveConversations()
          .reduce((sum, conversation) => sum + Number(conversation?.messages?.length || 0), 0);

        this.telemetryService.trackManagerMetric('governance', 'event_count', governanceEventCount, {
          tickId,
          correlationId,
          manager: 'governance',
          log: false
        });
        this.telemetryService.trackManagerMetric('interaction', 'interaction_count', interactionCount, {
          tickId,
          correlationId,
          manager: 'interaction',
          log: false
        });
        this.telemetryService.trackManagerMetric('world', 'tick_duration_ms', tickDuration, {
          tickId,
          correlationId,
          manager: 'world',
          log: false
        });
      }

      this.logger.info('world_tick_completed', {
        tickId,
        correlationId,
        durationMs: tickDuration,
        agentCount: Object.keys(this.worldState.getAllAgentPositions()).length
      });
      this.recordTickDuration(tickDuration);
    });
  }
}

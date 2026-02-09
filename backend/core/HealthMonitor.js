import { logger } from '../utils/logger.js';
import { metrics } from '../utils/metrics.js';

export class HealthMonitor {
  constructor({
    registry,
    worldState,
    npcSpawner,
    eventManager
  }) {
    this.registry = registry;
    this.worldState = worldState;
    this.npcSpawner = npcSpawner;
    this.eventManager = eventManager;

    this.config = {
      checkIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '10000', 10),
      lowPopulationThreshold: parseInt(process.env.HEALTH_LOW_POPULATION || '3', 10),
      tickLatencyMs: parseInt(process.env.HEALTH_TICK_LATENCY_MS || '500', 10),
      circuitBreakerWindowMs: parseInt(process.env.HEALTH_CIRCUIT_WINDOW_MS || '60000', 10),
      circuitBreakerFailures: parseInt(process.env.HEALTH_CIRCUIT_FAILURES || '5', 10)
    };

    this.lastCheck = 0;
    this.circuitBreakers = new Map();

    logger.info('HealthMonitor initialized');
  }

  tick() {
    const now = Date.now();
    if (now - this.lastCheck < this.config.checkIntervalMs) return;
    this.lastCheck = now;

    this.checkPopulation(now);
    this.checkTickLatency(now);
    this.cleanupCircuitBreakers(now);

    metrics.health.lastCheckAt = now;
  }

  checkPopulation(now) {
    const totalAgents = this.registry.getAgentCount();
    if (totalAgents < this.config.lowPopulationThreshold) {
      metrics.health.lowPopulationEvents += 1;
      if (this.eventManager) {
        this.eventManager.createEvent({
          name: 'Llamado de Emergencia',
          type: 'emergency',
          startAt: now,
          endAt: now + 20 * 60 * 1000,
          location: 'plaza',
          description: 'La ciudad necesita más actividad, ¡participa!',
          goalScope: 'global'
        });
      }
      logger.warn('HealthMonitor detected low population', { totalAgents });
    }

  }

  checkTickLatency() {
    if (metrics.world.lastTickMs > this.config.tickLatencyMs) {
      metrics.health.highTickLatencyEvents += 1;
      logger.warn('HealthMonitor detected high tick latency', { lastTickMs: metrics.world.lastTickMs });
    }
  }

  registerCircuitBreaker(name) {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, {
        failures: 0,
        state: 'closed',
        openedAt: null
      });
    }
  }

  recordCircuitFailure(name) {
    this.registerCircuitBreaker(name);
    const breaker = this.circuitBreakers.get(name);
    breaker.failures += 1;
    if (breaker.failures >= this.config.circuitBreakerFailures) {
      breaker.state = 'open';
      breaker.openedAt = Date.now();
      metrics.health.circuitOpened += 1;
      logger.warn('Circuit breaker opened', { name });
    }
  }

  recordCircuitSuccess(name) {
    if (!this.circuitBreakers.has(name)) return;
    const breaker = this.circuitBreakers.get(name);
    breaker.failures = 0;
    breaker.state = 'closed';
    breaker.openedAt = null;
  }

  isCircuitOpen(name) {
    const breaker = this.circuitBreakers.get(name);
    return breaker ? breaker.state === 'open' : false;
  }

  cleanupCircuitBreakers(now) {
    this.circuitBreakers.forEach((breaker, name) => {
      if (breaker.state === 'open' && breaker.openedAt && now - breaker.openedAt > this.config.circuitBreakerWindowMs) {
        breaker.state = 'half-open';
        breaker.failures = 0;
        breaker.openedAt = null;
        metrics.health.circuitHalfOpen += 1;
        logger.info('Circuit breaker half-open', { name });
      }
    });
  }
}

import express from 'express';
import path from 'path';

import authRoutes from '../routes/auth.js';
import moltbotRoutes from '../routes/moltbot.js';
import worldRoutes from '../routes/world.js';
import economyRoutes from '../routes/economy.js';
import voteRoutes from '../routes/vote.js';
import governanceRoutes from '../routes/governance.js';
import favorRoutes from '../routes/favor.js';
import reputationRoutes from '../routes/reputation.js';
import negotiationRoutes from '../routes/negotiation.js';
import telemetryRoutes from '../routes/telemetry.js';
import { createAestheticsRouter } from '../routes/aesthetics.js';
import eventRoutes from '../routes/events.js';
import coordinationRoutes from '../routes/coordination.js';
import commitmentsRoutes from '../routes/commitments.js';
import { createMetricsRouter } from '../routes/metrics.js';
import flagsRoutes from '../routes/flags.js';
import adminRoutes from '../routes/admin.js';
import showRoutes from '../routes/show.js';
import kickRoutes from '../routes/kick.js';
import { createAnalyticsRouter } from '../routes/analytics.js';

export function mountApplicationRoutes({
  app,
  frontendPath,
  io,
  worldState,
  moltbotRegistry,
  economyManager,
  eventManager,
  cityMoodManager,
  actionQueue,
  commitmentManager,
  reputationManager,
  featureFlags,
  coreFlags,
  aestheticsManager,
  analyticsStore
}) {
  app.use(express.static(frontendPath));
  app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/moltbot', moltbotRoutes);
  app.use('/api/world', worldRoutes);
  app.use('/api/economy', economyRoutes);
  app.use('/api/favor', favorRoutes);
  app.use('/api/reputation', reputationRoutes);
  app.use('/api/negotiation', negotiationRoutes);
  app.use('/api/telemetry', telemetryRoutes);
  app.use('/api/flags', flagsRoutes);
  app.use('/api/vote', voteRoutes);
  app.use('/api/governance', governanceRoutes);
  app.use('/api/aesthetics', createAestheticsRouter({ aestheticsManager }));
  app.use('/api/events', eventRoutes);
  app.use('/api/coordination', coordinationRoutes);
  app.use('/api/commitments', commitmentsRoutes);
  app.use('/api/show', showRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/kick', kickRoutes);
  app.use('/api/analytics', createAnalyticsRouter({
    registry: moltbotRegistry,
    eventManager,
    cityMoodManager,
    analyticsStore,
    io
  }));

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      agents: moltbotRegistry.getAgentCount(),
      worldTick: worldState.getCurrentTick()
    });
  });

  app.use('/api/metrics', createMetricsRouter({
    io,
    eventManager,
    economyManager,
    worldState,
    moltbotRegistry,
    cityMoodManager,
    actionQueue,
    commitmentManager,
    reputationManager,
    featureFlags,
    coreFlags
  }));

  app.get(/^\/(?!api|socket\.io).*/, (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

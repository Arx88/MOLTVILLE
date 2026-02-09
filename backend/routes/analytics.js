import express from 'express';
import { requireViewerKey } from '../utils/viewerAuth.js';
import { buildDramaScore } from '../utils/analyticsStore.js';
import { metrics } from '../utils/metrics.js';

export const createAnalyticsRouter = ({
  registry,
  eventManager,
  cityMoodManager,
  analyticsStore,
  io
}) => {
  const router = express.Router();

  router.get('/live', requireViewerKey, (req, res) => {
    const agents = registry.getAllAgents();
    const npcCount = agents.filter(agent => agent.isNPC).length;
    const mood = cityMoodManager?.getSummary();
    const events = eventManager.getSummary();
    const activeEvents = events.filter(event => event.status === 'active').length;
    const viewersRoom = io?.sockets?.adapter?.rooms?.get('viewers');
    const dramaScore = buildDramaScore({
      mood,
      activeEvents,
      npcDramaPoints: metrics.npc.dramaPoints
    });

    res.json({
      agents: {
        total: agents.length,
        npcs: npcCount,
        real: agents.length - npcCount
      },
      events: {
        active: activeEvents,
        total: events.length
      },
      currentScene: {
        score: dramaScore
      },
      uptime: Date.now() - metrics.startTime,
      viewers: viewersRoom ? viewersRoom.size : 0
    });
  });

  router.get('/drama-history', requireViewerKey, (req, res) => {
    res.json(analyticsStore.getHistory());
  });

  return router;
};

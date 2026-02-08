import express from 'express';
import { requireViewerKey } from '../utils/viewerAuth.js';
import { config } from '../utils/config.js';

const router = express.Router();

router.get('/config', requireViewerKey, (req, res) => {
  res.json({
    config: config.showMode || {}
  });
});

export default router;

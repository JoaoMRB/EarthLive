import { Router } from 'express';
import { buildHealth } from '../services/health.service.js';

const router = Router();

router.get('/', async (_req, res) => {
  const health = await buildHealth();
  res.status(health.ok ? 200 : 503).json(health);
});

export default router;

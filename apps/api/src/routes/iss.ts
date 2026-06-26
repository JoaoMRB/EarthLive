import { Router } from 'express';
import { getCached, setCache } from '../services/cache.js';
import { fetchISS } from '../services/fetchers.js';

const CACHE_TTL = 8_000;
const router = Router();

router.get('/', async (_req, res) => {
  try {
    const cached = await getCached('iss', CACHE_TTL);
    if (cached) {
      return res.json(cached);
    }

    const iss = await fetchISS();
    if (!iss) {
      return res.status(502).json({ error: 'ISS unavailable' });
    }
    await setCache('iss', iss, CACHE_TTL);
    res.json(iss);
  } catch (err) {
    console.error('iss error:', err);
    res.status(500).json({ error: 'Failed to fetch ISS' });
  }
});

export default router;

import { Router } from 'express';
import { getCached, setCache } from '../services/cache.js';
import {
  fetchFlights,
  fetchQuakes,
  fetchFires,
  type QuakePoint,
} from '../services/fetchers.js';

const FLIGHTS_TTL = 30_000;  // 30 seconds
const QUAKES_TTL = 120_000;  // 2 minutes
const FIRES_TTL = 600_000;   // 10 minutes

const router = Router();

router.get('/flights', async (_req, res) => {
  try {
    const cacheKey = 'earth-data:flights';
    const cached = await getCached<unknown>(cacheKey, FLIGHTS_TTL);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=15');
      return res.json(cached);
    }

    const flights = await fetchFlights();
    await setCache(cacheKey, flights, FLIGHTS_TTL);

    res.set('Cache-Control', 'public, max-age=15');
    res.json(flights);
  } catch (err) {
    console.error('flights error:', err);
    res.status(500).json({ error: 'Failed to fetch flights data' });
  }
});

router.get('/quakes', async (_req, res) => {
  try {
    const cacheKey = 'earth-data:quakes';
    const cached = await getCached<unknown>(cacheKey, QUAKES_TTL);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=60');
      return res.json(cached);
    }

    const quakes = await fetchQuakes();
    await setCache(cacheKey, quakes, QUAKES_TTL);

    res.set('Cache-Control', 'public, max-age=60');
    res.json(quakes);
  } catch (err) {
    console.error('quakes error:', err);
    res.status(500).json({ error: 'Failed to fetch quakes data' });
  }
});

router.get('/fires', async (_req, res) => {
  try {
    const cacheKey = 'earth-data:fires';
    const cached = await getCached<unknown>(cacheKey, FIRES_TTL);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=300');
      return res.json(cached);
    }

    const fires = await fetchFires();
    await setCache(cacheKey, fires, FIRES_TTL);

    res.set('Cache-Control', 'public, max-age=300');
    res.json(fires);
  } catch (err) {
    console.error('fires error:', err);
    res.status(500).json({ error: 'Failed to fetch fires data' });
  }
});

router.get('/', async (_req, res) => {
  try {
    const [flightsRes, quakesRes, firesRes] = await Promise.allSettled([
      getCached<any[]>('earth-data:flights', FLIGHTS_TTL).then(async (val) => {
        if (val) return val;
        const fresh = await fetchFlights();
        await setCache('earth-data:flights', fresh, FLIGHTS_TTL);
        return fresh;
      }),
      getCached<any[]>('earth-data:quakes', QUAKES_TTL).then(async (val) => {
        if (val) return val;
        const fresh = await fetchQuakes();
        await setCache('earth-data:quakes', fresh, QUAKES_TTL);
        return fresh;
      }),
      getCached<any[]>('earth-data:fires', FIRES_TTL).then(async (val) => {
        if (val) return val;
        const fresh = await fetchFires();
        await setCache('earth-data:fires', fresh, FIRES_TTL);
        return fresh;
      }),
    ]);

    const flights = flightsRes.status === 'fulfilled' ? flightsRes.value : [];
    const quakes = quakesRes.status === 'fulfilled' ? quakesRes.value : [];
    const fires = firesRes.status === 'fulfilled' ? firesRes.value : [];

    const strongestQuake =
      quakes.length > 0
        ? quakes.reduce((max: QuakePoint, q) =>
            q.magnitude > max.magnitude ? q : max,
          )
        : null;

    const data = {
      flights,
      quakes,
      fires,
      timestamp: Date.now(),
      meta: {
        flightCount: flights.length,
        quakeCount: quakes.length,
        fireCount: fires.length,
        strongestQuake,
      },
    };

    res.set('Cache-Control', 'public, max-age=15');
    res.json(data);
  } catch (err) {
    console.error('earth-data legacy error:', err);
    res.status(500).json({ error: 'Failed to fetch aggregated earth data' });
  }
});

export default router;

import { getCacheMeta } from './cache.js';

const PROBE_TIMEOUT_MS = 5_000;

export interface HealthResponse {
  ok: boolean;
  service: string;
  timestamp: number;
  config: {
    openskyAuth: boolean;
    nasaFirmsKey: boolean;
    redis: boolean;
  };
  cache: {
    flights: { present: boolean; ageMs: number | null };
    quakes: { present: boolean; ageMs: number | null };
    fires: { present: boolean; ageMs: number | null };
    iss: { present: boolean; ageMs: number | null };
  };
  upstream: {
    usgs: UpstreamStatus;
    openNotify: UpstreamStatus;
  };
}

type UpstreamStatus = 'ok' | 'degraded' | 'unknown';

export async function buildHealth(): Promise<HealthResponse> {
  const [usgs, openNotify, flightsCache, quakesCache, firesCache, issCache] =
    await Promise.all([
      probeUsgs(),
      probeOpenNotify(),
      getCacheMeta('earth-data:flights'),
      getCacheMeta('earth-data:quakes'),
      getCacheMeta('earth-data:fires'),
      getCacheMeta('iss'),
    ]);

  const degraded = usgs === 'degraded' && openNotify === 'degraded';

  return {
    ok: !degraded,
    service: 'earthlive-api',
    timestamp: Date.now(),
    config: {
      openskyAuth: Boolean(process.env.OPENSKY_USER && process.env.OPENSKY_PASS),
      nasaFirmsKey: Boolean(process.env.NASA_FIRMS_KEY),
      redis: Boolean(process.env.REDIS_URL),
    },
    cache: {
      flights: flightsCache,
      quakes: quakesCache,
      fires: firesCache,
      iss: issCache,
    },
    upstream: { usgs, openNotify },
  };
}

async function probeUsgs(): Promise<UpstreamStatus> {
  try {
    const res = await fetch(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
      { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) },
    );
    return res.ok ? 'ok' : 'degraded';
  } catch {
    return 'degraded';
  }
}

async function probeOpenNotify(): Promise<UpstreamStatus> {
  try {
    const res = await fetch('http://api.open-notify.org/iss-now.json', {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok ? 'ok' : 'degraded';
  } catch {
    return 'degraded';
  }
}

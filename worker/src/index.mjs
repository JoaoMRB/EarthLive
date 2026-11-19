// EarthLive flights proxy (option B — real-time flights).
//
// OpenSky does not allow browser requests from other sites, so this tiny
// Worker fetches it server-side, caches the result at the edge and adds CORS.
//
// Secrets (set with `wrangler secret put`, never committed):
//   OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET   (optional but recommended)
// Vars (wrangler.toml):
//   ALLOWED_ORIGINS  comma-separated list of sites allowed to call this Worker
//   CACHE_SECONDS    how long one OpenSky response is reused (default 60)

import { fetchFlights } from '../../shared/opensky.mjs';

const STALE_SECONDS = 6 * 60 * 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';
    const allowed = (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    const cors = allowed.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
      : {};

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' },
      });
    }
    if (request.method !== 'GET' || url.pathname !== '/flights') {
      return new Response('Not found', { status: 404, headers: cors });
    }

    const ttl = Number(env.CACHE_SECONDS) || 60;
    const cache = caches.default;
    const freshKey = new Request(`${url.origin}/__cache/flights`);
    const staleKey = new Request(`${url.origin}/__cache/flights-stale`);

    let body = await readCache(cache, freshKey);
    let state = 'HIT';

    if (!body) {
      try {
        const data = await fetchFlights({
          clientId: env.OPENSKY_CLIENT_ID,
          clientSecret: env.OPENSKY_CLIENT_SECRET,
        });
        body = JSON.stringify(data);
        state = 'MISS';
        ctx.waitUntil(Promise.all([
          writeCache(cache, freshKey, body, ttl),
          writeCache(cache, staleKey, body, STALE_SECONDS),
        ]));
      } catch (err) {
        // Rate-limited or OpenSky down: serve the last good copy if we have one.
        body = await readCache(cache, staleKey);
        state = 'STALE';
        if (!body) {
          return json({ error: 'flights unavailable' }, 502, cors);
        }
      }
    }

    return new Response(body, {
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${Math.min(ttl, 30)}`,
        'X-Cache': state,
      },
    });
  },
};

async function readCache(cache, key) {
  const hit = await cache.match(key);
  return hit ? hit.text() : null;
}

function writeCache(cache, key, body, seconds) {
  return cache.put(key, new Response(body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${seconds}` },
  }));
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

// Shared by the GitHub Action snapshot script (option A) and the Cloudflare
// Worker (option B). Runs on Node 20+ and on Workers: only uses fetch.
//
// Credentials are optional and only ever come from the environment
// (GitHub Secrets / Worker secrets). They are never shipped to the browser.

const STATES_URL = 'https://opensky-network.org/api/states/all';
const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

/** Column order of each row in the compact payload. */
export const FLIGHT_FIELDS = [
  'icao24', 'callsign', 'lat', 'lng', 'altM', 'speedMs', 'heading', 'country', 'vRate',
];

async function getToken(clientId, clientSecret) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`OpenSky auth failed: ${res.status}`);
  const json = await res.json();
  return json.access_token;
}

/**
 * Fetches all airborne aircraft from OpenSky and returns a compact payload:
 * { t: epochSeconds, fields: [...], rows: [[...], ...] }
 */
export async function fetchFlights({ clientId, clientSecret } = {}) {
  const headers = { Accept: 'application/json' };
  if (clientId && clientSecret) {
    headers.Authorization = `Bearer ${await getToken(clientId, clientSecret)}`;
  }

  const res = await fetch(STATES_URL, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`OpenSky states failed: ${res.status}`);
  const json = await res.json();

  const rows = [];
  for (const s of json.states ?? []) {
    const lng = s[5];
    const lat = s[6];
    if (lat == null || lng == null || s[8]) continue; // no position or on ground
    // > 1 300 km/h ground speed is a transponder/decoding glitch, not a real airliner.
    if ((s[9] ?? 0) > 360) continue;
    rows.push([
      s[0],
      String(s[1] ?? '').trim(),
      round(lat, 4),
      round(lng, 4),
      Math.round(s[13] ?? s[7] ?? 0),
      round(s[9] ?? 0, 1),
      Math.round(s[10] ?? 0),
      s[2] ?? '',
      round(s[11] ?? 0, 1),
    ]);
  }

  return { t: json.time ?? Math.floor(Date.now() / 1000), fields: FLIGHT_FIELDS, rows };
}

function round(n, d) {
  const f = 10 ** d;
  return Math.round(Number(n) * f) / f;
}

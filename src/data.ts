import { twoline2satrec, propagate, gstime, eciToGeodetic, type SatRec } from 'satellite.js';
import { config } from './config';

// ---------- Types ----------

export interface Flight {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  altM: number;
  speedMs: number;
  heading: number;
  country: string;
  vRate: number;
  /** Epoch seconds the position refers to. */
  t: number;
}

export interface Quake {
  id: string;
  lat: number;
  lng: number;
  depth: number;
  mag: number;
  place: string;
  time: number;
  tsunami: boolean;
  url: string;
}

export interface Fire {
  lat: number;
  lng: number;
  frp: number;
  conf: number;
  time: number;
  count: number;
}

export interface IssState {
  lat: number;
  lng: number;
  altKm: number;
  speedKmh: number;
}

export type QuakePeriod = 'hour' | 'day' | 'week';
export type FlightSource = 'snapshot' | 'live';

interface Compact {
  t: number;
  fields: string[];
  rows: unknown[][];
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

// ---------- Flights ----------

export async function loadFlights(source: FlightSource): Promise<{ t: number; flights: Flight[] }> {
  const url =
    source === 'live' && config.liveFlightsUrl
      ? config.liveFlightsUrl
      : `${config.snapshotBase}/flights.json?v=${Math.floor(Date.now() / 60_000)}`;
  const data = await getJson<Compact>(url, AbortSignal.timeout(20_000));
  const t = data.t;
  const flights: Flight[] = data.rows.map((r) => ({
    id: String(r[0]),
    callsign: String(r[1] ?? ''),
    lat: Number(r[2]),
    lng: Number(r[3]),
    altM: Number(r[4]),
    speedMs: Number(r[5]),
    heading: Number(r[6]),
    country: String(r[7] ?? ''),
    vRate: Number(r[8] ?? 0),
    t,
  }));
  return { t, flights };
}

const EARTH_R = 6_371_000;
const MAX_EXTRAPOLATION_S = 25 * 60;

/** Dead-reckoning: where the aircraft probably is now, from heading and speed. */
export function extrapolate(f: Flight, nowS: number): [number, number] {
  const dt = Math.min(Math.max(nowS - f.t, 0), MAX_EXTRAPOLATION_S);
  if (!dt || !f.speedMs) return [f.lng, f.lat];
  const d = (f.speedMs * dt) / EARTH_R;
  const h = (f.heading * Math.PI) / 180;
  const p1 = (f.lat * Math.PI) / 180;
  const l1 = (f.lng * Math.PI) / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(h));
  const l2 = l1 + Math.atan2(Math.sin(h) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  let lng = (l2 * 180) / Math.PI;
  lng = ((lng + 540) % 360) - 180;
  return [lng, (p2 * 180) / Math.PI];
}

// ---------- Earthquakes (USGS, CORS-enabled) ----------

interface UsgsFeed {
  features: {
    id: string;
    properties: { mag: number | null; place: string | null; time: number; tsunami: number; url: string };
    geometry: { coordinates: [number, number, number] };
  }[];
}

export async function loadQuakes(period: QuakePeriod): Promise<Quake[]> {
  const feed = period === 'hour' ? 'all_hour' : period === 'week' ? 'all_week' : 'all_day';
  const data = await getJson<UsgsFeed>(
    `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`,
    AbortSignal.timeout(20_000),
  );
  return data.features
    .filter((f) => f.properties.mag != null)
    .map((f) => ({
      id: f.id,
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      depth: f.geometry.coordinates[2],
      mag: f.properties.mag ?? 0,
      place: f.properties.place ?? '',
      time: f.properties.time,
      tsunami: f.properties.tsunami === 1,
      url: f.properties.url,
    }))
    .sort((a, b) => a.mag - b.mag); // big ones drawn last (on top)
}

// ---------- Fires (snapshot built by the GitHub Action) ----------

export async function loadFires(): Promise<{ t: number; fires: Fire[] }> {
  const data = await getJson<Compact>(
    `${config.snapshotBase}/fires.json?v=${Math.floor(Date.now() / 600_000)}`,
    AbortSignal.timeout(30_000),
  );
  return {
    t: data.t,
    fires: data.rows.map((r) => ({
      lat: Number(r[0]),
      lng: Number(r[1]),
      frp: Number(r[2]),
      conf: Number(r[3]),
      time: Number(r[4]),
      count: Number(r[5] ?? 1),
    })),
  };
}

// ---------- ISS (TLE + local orbit propagation) ----------

const TLE_SOURCES = [
  async () => {
    const j = await getJson<{ line1: string; line2: string }>('https://api.wheretheiss.at/v1/satellites/25544/tles');
    return [j.line1, j.line2] as const;
  },
  async () => {
    const res = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE');
    const lines = (await res.text()).trim().split('\n').map((l) => l.trim());
    return [lines[1], lines[2]] as const;
  },
];

const TLE_KEY = 'earthlive:iss-tle';

export async function loadIssOrbit(): Promise<SatRec> {
  let lastErr: unknown;
  for (const src of TLE_SOURCES) {
    try {
      const [l1, l2] = await src();
      try {
        localStorage.setItem(TLE_KEY, JSON.stringify([l1, l2]));
      } catch {
        /* storage unavailable */
      }
      return twoline2satrec(l1, l2);
    } catch (err) {
      lastErr = err;
    }
  }
  // Offline: a recent saved orbit is still close enough to show where the ISS is.
  try {
    const saved = JSON.parse(localStorage.getItem(TLE_KEY) ?? 'null') as [string, string] | null;
    if (saved) return twoline2satrec(saved[0], saved[1]);
  } catch {
    /* no usable copy */
  }
  throw lastErr;
}

const RAD = 180 / Math.PI;

export function issAt(sat: SatRec, date: Date): IssState | null {
  const pv = propagate(sat, date);
  if (!pv || typeof pv.position === 'boolean' || !pv.position) return null;
  const geo = eciToGeodetic(pv.position, gstime(date));
  const v = pv.velocity;
  const speed = v && typeof v !== 'boolean' ? Math.hypot(v.x, v.y, v.z) * 3600 : 0;
  return {
    lat: geo.latitude * RAD,
    lng: ((geo.longitude * RAD + 540) % 360) - 180,
    altKm: geo.height,
    speedKmh: speed,
  };
}

/** Ground track around `date`, split where it crosses the antimeridian. */
export function issTrack(sat: SatRec, date: Date, pastMin = 45, futureMin = 95): [number, number][][] {
  const lines: [number, number][][] = [];
  let cur: [number, number][] = [];
  let prevLng: number | null = null;
  for (let m = -pastMin; m <= futureMin; m += 0.5) {
    const s = issAt(sat, new Date(date.getTime() + m * 60_000));
    if (!s) continue;
    if (prevLng !== null && Math.abs(s.lng - prevLng) > 180) {
      lines.push(cur);
      cur = [];
    }
    cur.push([s.lng, s.lat]);
    prevLng = s.lng;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

#!/usr/bin/env node
// Builds the static data snapshots served next to the site:
//   <out>/flights.json  — OpenSky, all airborne aircraft (option A)
//   <out>/fires.json    — NASA FIRMS public 24h CSVs (no API key needed)
//
// Usage: node scripts/fetch-data.mjs public/data
// Optional env (GitHub Secrets): OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET
//
// Each dataset is independent: if one source fails, the previous file is kept
// and the script still succeeds, so a deploy never ships an empty map.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchFlights } from '../shared/opensky.mjs';
import { fetchGfs, encodeWeatherPng, RANGES } from './gfs.mjs';

const outDir = process.argv[2] ?? 'public/data';

const FIRMS_SOURCES = [
  { sat: 'N20', url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv' },
  { sat: 'N21', url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv' },
  { sat: 'SNPP', url: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv' },
];

async function buildFires() {
  const rows = [];
  for (const src of FIRMS_SOURCES) {
    try {
      const res = await fetch(src.url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(String(res.status));
      const lines = (await res.text()).trim().split('\n');
      const h = lines[0].split(',');
      const i = (k) => h.indexOf(k);
      const [iLat, iLng, iFrp, iConf, iDate, iTime] =
        ['latitude', 'longitude', 'frp', 'confidence', 'acq_date', 'acq_time'].map(i);
      if (iLat < 0 || iLng < 0) throw new Error('unexpected CSV header');
      for (const line of lines.slice(1)) {
        const c = line.split(',');
        const lat = Number(c[iLat]);
        const lng = Number(c[iLng]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const t = String(c[iTime] ?? '').padStart(4, '0');
        const when = Date.parse(`${c[iDate]}T${t.slice(0, 2)}:${t.slice(2)}:00Z`) / 1000;
        // confidence: VIIRS uses l / n / h
        rows.push([round(lat, 3), round(lng, 3), round(Number(c[iFrp]) || 0, 1), c[iConf] ?? '', when || 0, src.sat]);
      }
      console.log(`fires ${src.sat}: ok`);
    } catch (err) {
      console.warn(`fires ${src.sat}: skipped (${err.message})`);
    }
  }
  if (!rows.length) throw new Error('no fire data from any satellite');

  // The satellites overlap heavily: merge detections into ~5 km cells, keeping
  // the strongest one and how many detections fell in the cell.
  const CELL = 0.05;
  const CONF = { low: 0, l: 0, nominal: 1, n: 1, high: 2, h: 2 };
  const cells = new Map();
  for (const r of rows) {
    const key = `${Math.round(r[0] / CELL)}:${Math.round(r[1] / CELL)}`;
    const prev = cells.get(key);
    if (!prev) cells.set(key, [r[0], r[1], r[2], CONF[r[3]] ?? 1, r[4], 1]);
    else {
      prev[5] += 1;
      if (r[2] > prev[2]) { prev[0] = r[0]; prev[1] = r[1]; prev[2] = r[2]; }
      prev[3] = Math.max(prev[3], CONF[r[3]] ?? 1);
      prev[4] = Math.max(prev[4], r[4]);
    }
  }
  return {
    t: Math.floor(Date.now() / 1000),
    fields: ['lat', 'lng', 'frp', 'conf', 'time', 'count'],
    rows: [...cells.values()],
  };
}

function round(n, d) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

async function save(name, build) {
  const file = join(outDir, name);
  try {
    const data = await build();
    await writeFile(file, JSON.stringify(data));
    console.log(`${name}: ${data.rows.length} rows`);
  } catch (err) {
    console.warn(`${name}: FAILED (${err.message})`);
    try {
      await readFile(file);
      console.warn(`${name}: keeping previous file`);
    } catch {
      await writeFile(file, JSON.stringify({ t: 0, fields: [], rows: [] }));
      console.warn(`${name}: wrote empty placeholder`);
    }
  }
}

async function saveWeather() {
  try {
    const g = await fetchGfs();
    await writeFile(join(outDir, 'weather.png'), encodeWeatherPng(g));
    await writeFile(
      join(outDir, 'weather.json'),
      JSON.stringify({ runTime: g.runTime, validTime: g.validTime, width: g.nx, height: g.ny, ranges: RANGES, source: 'NOAA GFS 1°' }),
    );
    console.log(`weather: GFS run ${new Date(g.runTime * 1000).toISOString()} valid ${new Date(g.validTime * 1000).toISOString()}`);
  } catch (err) {
    console.warn(`weather: FAILED (${err.message}) — keeping previous files if any`);
  }
}

await mkdir(outDir, { recursive: true });
await Promise.all([
  save('flights.json', () =>
    fetchFlights({
      clientId: process.env.OPENSKY_CLIENT_ID,
      clientSecret: process.env.OPENSKY_CLIENT_SECRET,
    }),
  ),
  save('fires.json', buildFires),
  saveWeather(),
]);

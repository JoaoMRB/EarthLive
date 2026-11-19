/**
 * Aurora forecast from NOAA SWPC (no key, CORS enabled):
 * - OVATION model: probability (%) of visible aurora on a 1° grid, ~30–90 min ahead.
 * - Planetary Kp index: geomagnetic activity now and forecast for the next days.
 */
import { blobToDataUrl } from './weather';

export interface Aurora {
  /** Forecast time (epoch ms) of the OVATION grid. */
  time: number;
  /** probability 0–100, index = lon(0..359) * 181 + (lat + 90) */
  grid: Uint8Array;
  kpNow: number | null;
  kpMax24h: number | null;
}

export async function loadAurora(): Promise<Aurora> {
  const [ov, kp] = await Promise.all([
    fetch('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`ovation ${r.status}`);
      return r.json() as Promise<{ 'Forecast Time': string; coordinates: [number, number, number][] }>;
    }),
    fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<{ time_tag: string; kp: number; observed: string }[]>) : []))
      .catch(() => []),
  ]);

  const grid = new Uint8Array(360 * 181);
  for (const [lon, lat, p] of ov.coordinates) {
    const x = ((Math.round(lon) % 360) + 360) % 360;
    const y = Math.round(lat) + 90;
    if (y >= 0 && y <= 180) grid[x * 181 + y] = Math.max(0, Math.min(100, p));
  }

  // Kp: latest observed/estimated value, and the highest forecast in the next 24 h.
  const now = Date.now();
  let kpNow: number | null = null;
  let kpMax: number | null = null;
  for (const k of kp) {
    const t = Date.parse(`${k.time_tag}Z`);
    if (t <= now) kpNow = k.kp;
    else if (t <= now + 24 * 3600_000) kpMax = Math.max(kpMax ?? 0, k.kp);
  }

  return { time: Date.parse(ov['Forecast Time']) || now, grid, kpNow, kpMax24h: kpMax };
}

/** Bilinear probability (%) at a point. */
export function auroraAt(a: Aurora, lat: number, lng: number): number {
  const x = (((lng % 360) + 360) % 360);
  const y = Math.max(0, Math.min(179.999, lat + 90));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = (x0 + 1) % 360;
  const fx = x - x0;
  const fy = y - y0;
  const g = (xi: number, yi: number) => a.grid[xi * 181 + yi];
  const top = g(x0, y0) * (1 - fx) + g(x1, y0) * fx;
  const bot = g(x0, y0 + 1) * (1 - fx) + g(x1, y0 + 1) * fx;
  return top * (1 - fy) + bot * fy;
}

/** Colour ramp: faint green → bright green → yellow → magenta, transparent below ~4 %. */
export const AURORA_SCALE: [number, string][] = [
  [5, '#1E9E5A'], [20, '#3BE37F'], [40, '#B6F24A'], [60, '#F2D64B'], [80, '#FF5FA2'], [100, '#C04BFF'],
];

function ramp(p: number): [number, number, number, number] {
  if (p < 4) return [0, 0, 0, 0];
  const stops = AURORA_SCALE.map(([v, c]) => {
    const n = parseInt(c.slice(1), 16);
    return [v, (n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  });
  let rgb: readonly number[] = stops[stops.length - 1].slice(1);
  for (let i = 1; i < stops.length; i++) {
    if (p <= stops[i][0]) {
      const a = stops[i - 1];
      const b = stops[i];
      const f = Math.max(0, (p - a[0]) / (b[0] - a[0]));
      rgb = [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
      break;
    }
  }
  const alpha = Math.min(1, 0.25 + p / 45); // low probabilities stay soft
  return [rgb[0], rgb[1], rgb[2], alpha * 255];
}

/** Web-Mercator image (square, ±85.05°) for an image source. */
export async function renderAurora(a: Aurora, size = 720): Promise<string> {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / size))) * 180) / Math.PI;
    if (Math.abs(lat) < 35) continue; // aurora never reaches the tropics
    for (let x = 0; x < size; x++) {
      const lng = ((x + 0.5) / size) * 360 - 180;
      const [r, g, b, al] = ramp(auroraAt(a, lat, lng));
      if (!al) continue;
      const o = (y * size + x) * 4;
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = al;
    }
  }
  ctx.putImageData(img, 0, 0);
  return blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
}

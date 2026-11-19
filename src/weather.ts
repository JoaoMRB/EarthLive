import { config } from './config';

/** Global 1° weather grid decoded from the GFS snapshot PNG. */
export interface WeatherGrid {
  runTime: number; // epoch ms of the model run
  validTime: number; // epoch ms the fields are valid for
  w: number;
  h: number;
  u: Float32Array; // m/s, eastward
  v: Float32Array; // m/s, northward
  t: Float32Array; // °C
}

interface Meta {
  runTime: number;
  validTime?: number;
  width: number;
  height: number;
  ranges: { u: [number, number]; v: [number, number]; t: [number, number] };
}

export async function loadWeather(): Promise<WeatherGrid> {
  const bust = Math.floor(Date.now() / 600_000);
  const meta = (await (await fetch(`${config.snapshotBase}/weather.json?v=${bust}`, { cache: 'no-cache' })).json()) as Meta;
  const blob = await (await fetch(`${config.snapshotBase}/weather.png?v=${bust}`, { cache: 'no-cache' })).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(meta.width, meta.height);
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' })!;
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, meta.width, meta.height).data;
  const n = meta.width * meta.height;
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  const t = new Float32Array(n);
  const de = (b: number, [lo, hi]: [number, number]) => lo + (b / 255) * (hi - lo);
  for (let i = 0; i < n; i++) {
    u[i] = de(px[i * 4], meta.ranges.u);
    v[i] = de(px[i * 4 + 1], meta.ranges.v);
    t[i] = de(px[i * 4 + 2], meta.ranges.t);
  }
  return { runTime: meta.runTime * 1000, validTime: (meta.validTime ?? meta.runTime) * 1000, w: meta.width, h: meta.height, u, v, t };
}

/** Bilinear sample of one field at a position (grid: x = lng + 180, y = 90 - lat). */
export function sample(g: WeatherGrid, f: Float32Array, lng: number, lat: number): number {
  const x = (((lng + 180) % 360) + 360) % 360;
  const y = Math.max(0, Math.min(g.h - 1.001, 90 - lat));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = (x0 + 1) % g.w;
  const fx = x - x0;
  const fy = y - y0;
  const r0 = y0 * g.w;
  const r1 = (y0 + 1) * g.w;
  const a = f[r0 + x0] * (1 - fx) + f[r0 + x1] * fx;
  const b = f[r1 + x0] * (1 - fx) + f[r1 + x1] * fx;
  return a * (1 - fy) + b * fy;
}

// ---------- Colour scales ----------

type Stop = [number, string];

export const TEMP_SCALE: Stop[] = [
  [-40, '#B49CFF'], [-25, '#6C7CFF'], [-10, '#4AA8F0'], [0, '#9EDDF2'],
  [8, '#7DD9A2'], [16, '#E4E36F'], [24, '#FFB44A'], [32, '#FF6A3D'], [40, '#D9246E'],
];

/** km/h */
export const WIND_SCALE: Stop[] = [
  [0, '#2E3A57'], [10, '#3C7FC4'], [20, '#38B3A4'], [35, '#9BD24A'],
  [50, '#F2C64B'], [70, '#F2783B'], [100, '#D42F6E'],
];

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function scaleLut(stops: Stop[]): (v: number) => [number, number, number] {
  const rgb = stops.map(([v, c]) => [v, ...hexRgb(c)] as [number, number, number, number]);
  return (v) => {
    if (v <= rgb[0][0]) return [rgb[0][1], rgb[0][2], rgb[0][3]];
    for (let i = 1; i < rgb.length; i++) {
      if (v <= rgb[i][0]) {
        const a = rgb[i - 1];
        const b = rgb[i];
        const f = (v - a[0]) / (b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
      }
    }
    const l = rgb[rgb.length - 1];
    return [l[1], l[2], l[3]];
  };
}

export const MERC_LAT = 85.051129;

/**
 * Renders a field as a Web-Mercator image (square, ±85.05°) so it can be placed
 * on the map as an image source. Returns a PNG data URL.
 */
export async function renderField(g: WeatherGrid, kind: 'temp' | 'wind', size = 720): Promise<string> {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const lut = scaleLut(kind === 'temp' ? TEMP_SCALE : WIND_SCALE);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / size))) * 180) / Math.PI;
    for (let x = 0; x < size; x++) {
      const lng = ((x + 0.5) / size) * 360 - 180;
      const val =
        kind === 'temp'
          ? sample(g, g.t, lng, lat)
          : Math.hypot(sample(g, g.u, lng, lat), sample(g, g.v, lng, lat)) * 3.6;
      const [r, gg, b] = lut(val);
      const o = (y * size + x) * 4;
      d[o] = r;
      d[o + 1] = gg;
      d[o + 2] = b;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

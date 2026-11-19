import { addProtocol } from 'maplibre-gl';

/** Raster tile layer description understood by EarthMap.setRaster(). */
export interface RasterSpec {
  tiles: string[];
  maxzoom: number;
  tileSize?: number;
  opacity: number;
  attribution?: string;
}

// ---------- Dates ----------

export const LIGHTS_COMPOSITE = '2016';

/** 'YYYY-MM-DD' for a UTC day offset from today. */
export function utcDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400_000).toISOString().slice(0, 10);
}

export function shiftDay(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86400_000).toISOString().slice(0, 10);
}

/** Valid date range per dated layer (GIBS keeps a rolling archive for some). */
export const DATE_LIMITS = {
  lights: { min: '2024-03-25', latest: () => utcDay(-1) },
  satellite: { min: '2022-01-14', latest: () => utcDay(-1) },
  aerosol: { min: () => utcDay(-110), latest: () => utcDay(-2) },
} as const;

export type DatedLayer = keyof typeof DATE_LIMITS;

export function clampDay(layer: DatedLayer, day: string): string {
  if (layer === 'lights' && day === LIGHTS_COMPOSITE) return day;
  const lim = DATE_LIMITS[layer];
  const min = typeof lim.min === 'function' ? lim.min() : lim.min;
  const max = lim.latest();
  return day < min ? min : day > max ? max : day;
}

// ---------- NASA GIBS (no key, CORS enabled) ----------

const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

function gibs(layer: string, time: string, level: number, ext: 'png' | 'jpg'): string {
  return `${GIBS}/${layer}/default/${time}/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.${ext}`;
}

export function datedRaster(layer: DatedLayer, day: string): RasterSpec {
  switch (layer) {
    case 'lights':
      return day === LIGHTS_COMPOSITE
        ? { tiles: [gibs('VIIRS_Black_Marble', '2016-01-01', 8, 'png')], maxzoom: 8, opacity: 1 }
        : { tiles: [gibs('VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance', day, 8, 'png')], maxzoom: 8, opacity: 1 };
    case 'satellite':
      return { tiles: [gibs('VIIRS_NOAA20_CorrectedReflectance_TrueColor', day, 9, 'jpg')], maxzoom: 9, opacity: 1 };
    case 'aerosol':
      return { tiles: [gibs('MODIS_Combined_Value_Added_AOD', day, 6, 'png')], maxzoom: 6, opacity: 0.75 };
  }
}

// ---------- Clouds: EUMETSAT global infrared composite ----------
// The WMS image is a grey infrared picture (cold cloud tops = bright). A custom
// protocol turns brightness into white clouds with transparency, so the map
// stays visible underneath.

let cloudsRegistered = false;

export function cloudsRaster(bust: number): RasterSpec {
  if (!cloudsRegistered) {
    cloudsRegistered = true;
    addProtocol('clouds', async (params, abort) => {
      const bbox = params.url.replace('clouds://', '').split('/')[1];
      const url =
        'https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap' +
        '&layers=mumi:worldcloudmap_ir108&styles=&format=image/png&transparent=true' +
        `&crs=EPSG:3857&width=256&height=256&bbox=${bbox}`;
      const res = await fetch(url, { signal: abort.signal });
      if (!res.ok) throw new Error(`clouds ${res.status}`);
      const bmp = await createImageBitmap(await res.blob());
      const canvas = new OffscreenCanvas(256, 256);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0, 256, 256);
      const img = ctx.getImageData(0, 0, 256, 256);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i] / 255; // brightness ~ cloud-top coldness
        const a = Math.max(0, Math.min(1, (v - 0.36) / 0.4)); // warm ground → transparent, cold cloud tops → white
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = d[i + 3] ? Math.round(Math.pow(a, 1.4) * 240) : 0;
      }
      ctx.putImageData(img, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return { data: await blob.arrayBuffer() };
    });
  }
  return { tiles: [`clouds://${bust}/{bbox-epsg-3857}`], maxzoom: 6, opacity: 0.9 };
}

// ---------- Rain radar: RainViewer ----------

export async function radarRaster(): Promise<{ spec: RasterSpec; time: number }> {
  const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`rainviewer ${res.status}`);
  const j = (await res.json()) as { host: string; radar: { past: { time: number; path: string }[] } };
  const last = j.radar.past.at(-1);
  if (!last) throw new Error('no radar frames');
  return {
    time: last.time * 1000,
    spec: { tiles: [`${j.host}${last.path}/256/{z}/{x}/{y}/2/1_1.png`], maxzoom: 7, opacity: 0.8 },
  };
}

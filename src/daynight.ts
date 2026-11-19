import { blobToDataUrl } from './weather';

const RAD = Math.PI / 180;

/** Sub-solar point (where the Sun is overhead) for a date. Accurate to ~0.1°. */
export function subsolar(date: Date): { lat: number; lng: number } {
  const n = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400_000;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / RAD;
  const gmst = ((18.697374558 + 24.06570982441908 * n) % 24) * 15;
  let lng = ra - gmst;
  lng = ((lng + 540) % 360) - 180;
  return { lat: dec / RAD, lng };
}

/** Sun elevation (degrees) at a place. */
export function sunAltitude(lat: number, lng: number, sun = subsolar(new Date())): number {
  const p = lat * RAD;
  const d = sun.lat * RAD;
  const h = (lng - sun.lng) * RAD;
  return Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h)) / RAD;
}

/**
 * Night shading as a Web-Mercator image: transparent in daylight, darkening
 * smoothly through civil, nautical and astronomical twilight.
 */
export async function renderNight(dark: boolean, date = new Date(), size = 512): Promise<string> {
  const sun = subsolar(date);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const [r, g, b] = dark ? [4, 6, 12] : [20, 28, 54];
  const maxA = dark ? 0.62 : 0.4;
  for (let y = 0; y < size; y++) {
    const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / size))) / RAD;
    for (let x = 0; x < size; x++) {
      const lng = ((x + 0.5) / size) * 360 - 180;
      const alt = sunAltitude(lat, lng, sun);
      const t = Math.max(0, Math.min(1, (0.8 - alt) / 18.8)); // 0 at +0.8°, 1 at -18°
      const o = (y * size + x) * 4;
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = Math.round(maxA * t * (2 - t) * 255); // ease-out
    }
  }
  ctx.putImageData(img, 0, 0);
  return blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
}

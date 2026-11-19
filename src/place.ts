/** Current weather and air quality for any point, from Open-Meteo (no key, CORS enabled). */
import { t } from './i18n';

export interface PlaceInfo {
  lat: number;
  lng: number;
  utcOffsetS: number;
  isDay: boolean;
  temp: number;
  feels: number;
  humidity: number;
  cloud: number;
  precip: number;
  windKmh: number;
  windDir: number;
  code: number;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
}

export async function loadPlace(lat: number, lng: number, signal?: AbortSignal): Promise<PlaceInfo> {
  const q = `latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&timezone=auto`;
  const [wRes, aRes] = await Promise.all([
    fetch(
      `https://api.open-meteo.com/v1/forecast?${q}&current=temperature_2m,apparent_temperature,relative_humidity_2m,` +
        'precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code,is_day',
      { signal },
    ),
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&current=european_aqi,pm2_5,pm10`, { signal }).catch(
      () => null,
    ),
  ]);
  if (!wRes.ok) throw new Error(`open-meteo ${wRes.status}`);
  const w = (await wRes.json()) as { utc_offset_seconds: number; current: Record<string, number> };
  let a: Record<string, number | null> = {};
  if (aRes?.ok) a = ((await aRes.json()) as { current: Record<string, number | null> }).current ?? {};
  const c = w.current;
  return {
    lat,
    lng,
    utcOffsetS: w.utc_offset_seconds,
    isDay: c.is_day === 1,
    temp: c.temperature_2m,
    feels: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    cloud: c.cloud_cover,
    precip: c.precipitation,
    windKmh: c.wind_speed_10m,
    windDir: c.wind_direction_10m,
    code: c.weather_code,
    aqi: a.european_aqi ?? null,
    pm25: a.pm2_5 ?? null,
    pm10: a.pm10 ?? null,
  };
}

/** WMO weather code → short description in the current language. */
export function weatherText(code: number): string {
  const w = t().weather;
  if (code === 0) return w.clear;
  if (code <= 2) return w.partly;
  if (code === 3) return w.overcast;
  if (code <= 48) return w.fog;
  if (code <= 57) return w.drizzle;
  if (code <= 67) return w.rain;
  if (code <= 77) return w.snow;
  if (code <= 82) return w.showers;
  if (code <= 86) return w.snowShowers;
  return w.storm;
}

/** European AQI bands. */
export function aqiText(aqi: number): string {
  const band = aqi <= 20 ? 0 : aqi <= 40 ? 1 : aqi <= 60 ? 2 : aqi <= 80 ? 3 : aqi <= 100 ? 4 : 5;
  return t().aqi[band];
}

export const compass = (deg: number): string => t().compass[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

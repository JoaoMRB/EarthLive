export interface FlightPoint {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  alt: number;
  speed: number;
  heading: number;
  country: string;
  speedAnomaly?: boolean;
}

export interface QuakePoint {
  id: string;
  lat: number;
  lng: number;
  depth: number;
  magnitude: number;
  place: string;
  time: number;
  tsunami: boolean;
}

export interface FirePoint {
  lat: number;
  lng: number;
  brightness: number;
  confidence: string;
  datetime: string;
}

export interface ISSPosition {
  lat: number;
  lng: number;
  timestamp: number;
  crew?: { name: string; craft: string }[];
}

export async function fetchFlights(): Promise<FlightPoint[]> {
  const username = process.env.OPENSKY_USER ?? '';
  const password = process.env.OPENSKY_PASS ?? '';
  const headers: HeadersInit = {};

  if (username && password) {
    headers['Authorization'] =
      'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  }

  const res = await fetch('https://opensky-network.org/api/states/all', {
    headers,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    console.error(`OpenSky API error: ${res.status}`);
    return [];
  }

  const json = (await res.json()) as { states?: unknown[][] };
  if (!json.states) return [];

  return json.states
    .filter((s) => s[5] != null && s[6] != null && !s[8])
    .slice(0, 8_000)  // Reduced from 15_000 → backend sampling for perf
    .map((s) => {
      const speed = Math.round(Number(s[9] ?? 0) * 3.6);
      const alt = Number(s[7] ?? 0);
      
      return {
        id: String(s[0]),
        callsign: String(s[1] ?? '').trim(),
        lat: Number(s[6]),
        lng: Number(s[5]),
        alt,
        speed,
        heading: Math.round(Number(s[10] ?? 0)),
        country: String(s[2] ?? ''),
        speedAnomaly: isSpeedAnomaly(speed, alt),
      };
    });
}

/**
 * Detects unrealistic flight speeds caused by ADS-B data corruption
 * - Commercial aircraft max speed: ~900 km/h (Mach 0.85)
 * - Military jets and supersonic aircraft are rare in OpenSky free data
 * - Speeds > 1000 km/h indicate API data corruption from:
 *   1. ADS-B transponder transmission errors
 *   2. GPS timing sync issues between ground stations
 *   3. Incorrect interpolation of position changes
 */
function isSpeedAnomaly(speed: number, altitude: number): boolean {
  // Filter out clearly impossible speeds (> 1000 km/h)
  if (speed > 1000) return true;
  
  // Flag suspicious high speeds that exceed normal operations
  // Even at high altitude, commercial aircraft rarely exceed 920 km/h
  if (speed > 950) return true;
  
  return false;
}

export async function fetchQuakes(): Promise<QuakePoint[]> {
  const res = await fetch(
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    { signal: AbortSignal.timeout(10_000) },
  );

  if (!res.ok) return [];

  const json = (await res.json()) as {
    features: Array<{
      id: string;
      properties: {
        mag: number;
        place: string;
        time: number;
        tsunami: number;
      };
      geometry: { coordinates: [number, number, number] };
    }>;
  };

  return json.features.map((f) => ({
    id: f.id,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    depth: f.geometry.coordinates[2],
    magnitude: f.properties.mag,
    place: f.properties.place,
    time: f.properties.time,
    tsunami: f.properties.tsunami === 1,
  }));
}

export async function fetchFires(): Promise<FirePoint[]> {
  const mapKey = process.env.NASA_FIRMS_KEY ?? '';
  if (!mapKey) {
    console.warn('NASA FIRMS key not set (NASA_FIRMS_KEY)');
    return [];
  }

  const res = await fetch(
    `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/VIIRS_SNPP_NRT/world/1`,
    { signal: AbortSignal.timeout(30_000) },
  );

  if (!res.ok) return [];

  const csv = await res.text();
  const lines = csv.split('\n');
  const headers = lines[0]?.split(',') ?? [];

  const latIdx = headers.indexOf('latitude');
  const lngIdx = headers.indexOf('longitude');
  const brightIdx = headers.indexOf('bright_ti4');
  const confIdx = headers.indexOf('confidence');
  const dateIdx = headers.indexOf('acq_date');
  const timeIdx = headers.indexOf('acq_time');

  return lines
    .slice(1)
    .filter((line) => line.trim())
    .slice(0, 5_000)  // Reduced from 10_000 → backend sampling for perf
    .map((line) => {
      const cols = line.split(',');
      return {
        lat: parseFloat(cols[latIdx]),
        lng: parseFloat(cols[lngIdx]),
        brightness: parseFloat(cols[brightIdx]),
        confidence: cols[confIdx] ?? '',
        datetime: `${cols[dateIdx]} ${cols[timeIdx]}`,
      };
    })
    .filter((f) => !Number.isNaN(f.lat) && !Number.isNaN(f.lng));
}

export async function fetchISS(): Promise<ISSPosition | null> {
  const posRes = await fetch('http://api.open-notify.org/iss-now.json', {
    signal: AbortSignal.timeout(8_000),
  });

  if (!posRes.ok) return null;

  const posJson = (await posRes.json()) as {
    iss_position: { latitude: string; longitude: string };
    timestamp: number;
  };

  let crew: ISSPosition['crew'];
  try {
    const crewRes = await fetch('http://api.open-notify.org/astros.json', {
      signal: AbortSignal.timeout(8_000),
    });
    if (crewRes.ok) {
      const crewJson = (await crewRes.json()) as {
        people: { name: string; craft: string }[];
      };
      crew = crewJson.people;
    }
  } catch {
    // Posição ISS é crítica; tripulação é opcional se Open Notify estiver lento
  }

  return {
    lat: parseFloat(posJson.iss_position.latitude),
    lng: parseFloat(posJson.iss_position.longitude),
    timestamp: posJson.timestamp * 1000,
    crew,
  };
}

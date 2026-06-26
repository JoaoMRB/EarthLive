export interface ViewportBounds {
  n: number;
  s: number;
  e: number;
  w: number;
}

export interface GlobePov {
  lat: number;
  lng: number;
  altitude: number;
}

export function boundsFromPov(pov: GlobePov): ViewportBounds {
  const visibleRadius = Math.min(90, 90 / Math.max(0.35, pov.altitude * 1.8));
  return {
    n: Math.min(90, pov.lat + visibleRadius),
    s: Math.max(-90, pov.lat - visibleRadius),
    e: pov.lng + visibleRadius,
    w: pov.lng - visibleRadius,
  };
}

export function shouldCullToViewport(pov: GlobePov): boolean {
  return pov.altitude <= 1.35;
}

export function limitsForPov(pov: GlobePov): { flights: number; fires: number } {
  const alt = pov.altitude;
  if (alt > 2.8) return { flights: 90, fires: 140 };
  if (alt > 2.0) return { flights: 160, fires: 220 };
  if (alt > 1.2) return { flights: 260, fires: 340 };
  if (alt > 0.6) return { flights: 420, fires: 560 };
  return { flights: 700, fires: 900 };
}

export function inViewport(
  lat: number,
  lng: number,
  bounds: ViewportBounds,
): boolean {
  if (lat < bounds.s || lat > bounds.n) return false;
  if (bounds.w <= bounds.e) {
    return lng >= bounds.w && lng <= bounds.e;
  }
  return lng >= bounds.w || lng <= bounds.e;
}

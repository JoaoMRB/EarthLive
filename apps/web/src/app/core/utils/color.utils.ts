/**
 * Utility functions for colour handling in the EarthLive globe.
 * Centralises colour logic so it can be reused across components and services.
 */

/**
 * Returns a colour string for a flight altitude (in metres).
 * Mirrors the logic currently in GlobeManagerService.
 */
export function altitudeColor(altMeters: number): string {
  if (altMeters < 3000) return '#34d399'; // low altitude – green
  if (altMeters < 8000) return '#38bdf8'; // medium altitude – cyan
  return '#818cf8'; // high altitude – indigo
}

/**
 * Generic layer accent colour mapping.
 */
export const LAYER_ACCENT_COLORS: Record<string, string> = {
  flight: '#38bdf8',
  quake: '#f97316',
  fire: '#fb7185',
  iss: '#a78bfa',
};

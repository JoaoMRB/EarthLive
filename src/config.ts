/**
 * Build-time configuration. Everything here ends up in the public bundle,
 * so it must never contain secrets — only public URLs.
 */
export const config = {
  /** Snapshot files produced by the GitHub Action (option A). */
  snapshotBase: './data',
  /**
   * Optional Cloudflare Worker URL for real-time flights (option B), e.g.
   * https://earthlive-flights.<you>.workers.dev/flights
   * When empty, the "Tempo real" choice is hidden.
   */
  liveFlightsUrl: (import.meta.env.VITE_FLIGHTS_LIVE_URL as string | undefined)?.trim() ?? '',
  refresh: {
    flightsSnapshot: 5 * 60_000,
    flightsLive: 30_000,
    quakes: 2 * 60_000,
    fires: 30 * 60_000,
    issTle: 6 * 60 * 60_000,
  },
  styles: {
    light: 'https://tiles.openfreemap.org/styles/positron',
    dark: 'https://tiles.openfreemap.org/styles/dark',
  },
} as const;

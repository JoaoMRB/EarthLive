/**
 * Geometry helper functions used by the globe rendering logic.
 */

/** Clamp latitude to the WebGL globe limits. */
export function clampLatitude(value: number): number {
  return Math.max(-85, Math.min(85, value));
}

/** Wrap longitude to the -180…180 range. */
export function wrapLongitude(value: number): number {
  if (value > 180) return value - 360;
  if (value < -180) return value + 360;
  return value;
}

/**
 * Build a flight trail geometry for a given flight point.
 * Keeps the same algorithm as before but moves it to a reusable helper.
 */
export interface FlightPoint {
  id: string;
  lat: number;
  lng: number;
  alt: number;
  heading: number;
  speed: number;
}

export interface FlightTrail {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
}

import { altitudeColor } from './color.utils';

export function buildFlightTrail(flight: FlightPoint): FlightTrail {
  const headingRadians = (flight.heading * Math.PI) / 180;
  const distance = Math.max(0.6, Math.min(2.2, flight.speed / 520));
  const endLat = flight.lat + Math.cos(headingRadians) * distance;
  const endLng =
    flight.lng +
    (Math.sin(headingRadians) * distance) /
      Math.max(0.3, Math.cos((flight.lat * Math.PI) / 180));

  return {
    startLat: flight.lat,
    startLng: flight.lng,
    endLat: clampLatitude(endLat),
    endLng: wrapLongitude(endLng),
    color: altitudeColor(flight.alt),
  };
}

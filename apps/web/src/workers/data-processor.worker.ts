/// <reference lib="webworker" />

import type {
  FirePoint,
  FlightPoint,
  QuakePoint,
} from '../app/core/models/earth-data.model';
import {
  inViewport,
  type ViewportBounds,
} from '../app/core/utils/globe-viewport';

export interface ProcessPayload {
  flights: FlightPoint[];
  fires: FirePoint[];
  quakes: QuakePoint[];
  bounds: ViewportBounds;
  cullToViewport: boolean;
  limits: { flights: number; fires: number };
  layers: {
    flights: boolean;
    quakes: boolean;
    fires: boolean;
  };
}

export interface ProcessResult {
  id: number;
  flights: FlightPoint[];
  fires: FirePoint[];
  quakes: QuakePoint[];
}

function sample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0);
}

function process(payload: ProcessPayload): Omit<ProcessResult, 'id'> {
  const { bounds, cullToViewport, limits, layers } = payload;

  let flights = layers.flights ? payload.flights : [];
  let fires = layers.fires ? payload.fires : [];
  const quakes = layers.quakes ? payload.quakes : [];

  if (cullToViewport) {
    flights = flights.filter((f) => inViewport(f.lat, f.lng, bounds));
    fires = fires.filter((f) => inViewport(f.lat, f.lng, bounds));
  }

  flights = sample(flights, limits.flights);
  fires = sample(fires, limits.fires);

  return { flights, fires, quakes };
}

let jobId = 0;

addEventListener('message', ({ data }) => {
  const id = data?.id ?? ++jobId;
  const payload = data?.payload as ProcessPayload | undefined;
  if (!payload) return;

  const result = process(payload);
  postMessage({ ...result, id } satisfies ProcessResult);
});

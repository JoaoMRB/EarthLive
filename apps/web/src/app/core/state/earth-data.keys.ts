import { makeStateKey } from '@angular/core';
import type { EarthData, ISSPosition, FlightPoint, QuakePoint, FirePoint } from '../models/earth-data.model';

export type MainEarthPayload = Omit<EarthData, 'iss'>;

// Legacy key for backward compat
export const EARTH_MAIN_KEY = makeStateKey<MainEarthPayload>('earth-main-data');
export const EARTH_ISS_KEY = makeStateKey<ISSPosition>('earth-iss-data');

// Split keys for progressive loading
export const EARTH_FLIGHTS_KEY = makeStateKey<FlightPoint[]>('earth-flights');
export const EARTH_QUAKES_KEY = makeStateKey<QuakePoint[]>('earth-quakes');
export const EARTH_FIRES_KEY = makeStateKey<FirePoint[]>('earth-fires');

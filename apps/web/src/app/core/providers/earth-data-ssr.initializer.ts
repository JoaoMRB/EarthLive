import { isPlatformServer } from '@angular/common';
import {
  APP_INITIALIZER,
  PLATFORM_ID,
  TransferState,
  inject,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, forkJoin, of } from 'rxjs';
import { EARTH_API_BASE } from '../tokens/earth-api.token';
import {
  EARTH_ISS_KEY,
  EARTH_FLIGHTS_KEY,
  EARTH_QUAKES_KEY,
  EARTH_FIRES_KEY,
} from '../state/earth-data.keys';
import type { ISSPosition, FlightPoint, QuakePoint, FirePoint } from '../models/earth-data.model';

export function provideEarthDataSsrInitializer() {
  return {
    provide: APP_INITIALIZER,
    multi: true,
    useFactory: () => {
      const http = inject(HttpClient);
      const transfer = inject(TransferState);
      const platformId = inject(PLATFORM_ID);
      const apiBase = inject(EARTH_API_BASE);

      return () => {
        if (!isPlatformServer(platformId)) {
          return Promise.resolve();
        }

        // Fetch all 4 datasets in parallel — progressive loading begins with flights
        return firstValueFrom(
          forkJoin({
            flights: http
              .get<FlightPoint[]>(`${apiBase}/earth-data/flights`)
              .pipe(catchError(() => of([]))),
            quakes: http
              .get<QuakePoint[]>(`${apiBase}/earth-data/quakes`)
              .pipe(catchError(() => of([]))),
            fires: http
              .get<FirePoint[]>(`${apiBase}/earth-data/fires`)
              .pipe(catchError(() => of([]))),
            iss: http
              .get<ISSPosition>(`${apiBase}/iss`)
              .pipe(catchError(() => of(null))),
          }),
        )
          .then(({ flights, quakes, fires, iss }) => {
            transfer.set(EARTH_FLIGHTS_KEY, flights);
            transfer.set(EARTH_QUAKES_KEY, quakes);
            transfer.set(EARTH_FIRES_KEY, fires);
            if (iss) transfer.set(EARTH_ISS_KEY, iss);
          })
          .catch((err) => {
            console.warn('SSR earth-data prefetch failed:', err);
          });
      };
    },
  };
}

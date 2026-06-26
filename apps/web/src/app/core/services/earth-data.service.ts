import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  TransferState,
  Injectable,
  OnDestroy,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import {
  BehaviorSubject,
  Subject,
  catchError,
  interval,
  of,
  retry,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import {
  EARTH_ISS_KEY,
  EARTH_FLIGHTS_KEY,
  EARTH_QUAKES_KEY,
  EARTH_FIRES_KEY,
} from '../state/earth-data.keys';
import { EARTH_API_BASE } from '../tokens/earth-api.token';
import type {
  EarthData,
  FlightPoint,
  QuakePoint,
  FirePoint,
  ISSPosition,
} from '../models/earth-data.model';

// Independent polling intervals per dataset
const REFRESH = {
  flights: 30_000,   // 30s – critical real-time air traffic
  quakes: 120_000,   // 2min – seismic updates are slower
  fires: 300_000,    // 5min – satellite data refreshes slowly
  iss: 10_000,       // 10s – orbit tracking needs fast updates
} as const;

@Injectable({ providedIn: 'root' })
export class EarthDataService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly transferState = inject(TransferState);
  private readonly apiBase = inject(EARTH_API_BASE);
  private readonly destroy$ = new Subject<void>();

  private readonly data$ = new BehaviorSubject<EarthData | null>(null);
  private readonly loading$ = new BehaviorSubject(false);
  private readonly errorSubject$ = new BehaviorSubject<string | null>(null);
  private readonly lastUpdate$ = new BehaviorSubject<Date | null>(null);
  private started = false;

  readonly earthData$ = this.data$.asObservable();
  readonly isLoading$ = this.loading$.asObservable();
  readonly error$ = this.errorSubject$.asObservable();
  readonly lastUpdated$ = this.lastUpdate$.asObservable();

  get currentData(): EarthData | null {
    return this.data$.value;
  }

  startPolling(): void {
    if (!isPlatformBrowser(this.platformId) || this.started) return;
    this.started = true;

    const hydrated = this.hydrateFromTransfer();

    // Start three independent polling loops for the three datasets
    interval(REFRESH.flights)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.fetchFlights()),
      )
      .subscribe();

    interval(REFRESH.quakes)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.fetchQuakes()),
      )
      .subscribe();

    interval(REFRESH.fires)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.fetchFires()),
      )
      .subscribe();

    interval(REFRESH.iss)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.fetchISS()),
      )
      .subscribe();

    if (!hydrated) {
      // Progressive loading: flights first (critical), then the rest
      this.loading$.next(true);
      this.fetchFlights().subscribe(() => {
        this.fetchQuakes().subscribe();
        this.fetchFires().subscribe();
      });
      this.fetchISS().subscribe();
    }
  }

  private hydrateFromTransfer(): boolean {
    const hasFlights = this.transferState.hasKey(EARTH_FLIGHTS_KEY);
    const hasQuakes = this.transferState.hasKey(EARTH_QUAKES_KEY);
    const hasAnyData = hasFlights || hasQuakes;

    if (!hasAnyData) return false;

    const flights = hasFlights
      ? (this.transferState.get(EARTH_FLIGHTS_KEY, []) ?? [])
      : [];
    const quakes = this.transferState.hasKey(EARTH_QUAKES_KEY)
      ? (this.transferState.get(EARTH_QUAKES_KEY, []) ?? [])
      : [];
    const fires = this.transferState.hasKey(EARTH_FIRES_KEY)
      ? (this.transferState.get(EARTH_FIRES_KEY, []) ?? [])
      : [];
    const iss = this.transferState.hasKey(EARTH_ISS_KEY)
      ? this.transferState.get(EARTH_ISS_KEY, null)
      : null;

    // Clean up transfer state
    if (hasFlights) this.transferState.remove(EARTH_FLIGHTS_KEY);
    if (this.transferState.hasKey(EARTH_QUAKES_KEY))
      this.transferState.remove(EARTH_QUAKES_KEY);
    if (this.transferState.hasKey(EARTH_FIRES_KEY))
      this.transferState.remove(EARTH_FIRES_KEY);
    if (this.transferState.hasKey(EARTH_ISS_KEY))
      this.transferState.remove(EARTH_ISS_KEY);

    const meta = computeMeta(flights, quakes, fires);
    this.data$.next({ flights, quakes, fires, iss, timestamp: Date.now(), meta });
    this.lastUpdate$.next(new Date());
    return true;
  }

  private fetchFlights() {
    return this.http.get<FlightPoint[]>(`${this.apiBase}/earth-data/flights`).pipe(
      tap((flights) => {
        this.mergeData({ flights });
        this.loading$.next(false);
        this.errorSubject$.next(null);
      }),
      retry({ count: 2, delay: 3_000 }),
      catchError((err) => {
        console.error('flights fetch failed:', err);
        this.loading$.next(false);
        return of(null);
      }),
    );
  }

  private fetchQuakes() {
    return this.http.get<QuakePoint[]>(`${this.apiBase}/earth-data/quakes`).pipe(
      tap((quakes) => {
        this.mergeData({ quakes });
      }),
      retry({ count: 2, delay: 5_000 }),
      catchError((err) => {
        console.error('quakes fetch failed:', err);
        return of(null);
      }),
    );
  }

  private fetchFires() {
    return this.http.get<FirePoint[]>(`${this.apiBase}/earth-data/fires`).pipe(
      tap((fires) => {
        this.mergeData({ fires });
      }),
      retry({ count: 1, delay: 5_000 }),
      catchError((err) => {
        console.error('fires fetch failed:', err);
        return of(null);
      }),
    );
  }

  private fetchISS() {
    return this.http.get<ISSPosition>(`${this.apiBase}/iss`).pipe(
      tap((iss) => {
        const current = this.data$.value;
        if (current) {
          this.data$.next({ ...current, iss });
        } else {
          const meta = computeMeta([], [], []);
          this.data$.next({
            flights: [],
            quakes: [],
            fires: [],
            iss,
            timestamp: Date.now(),
            meta,
          });
        }
      }),
      catchError(() => of(null)),
    );
  }

  /**
   * Merges a partial update into the current data state
   * and recalculates meta (counts, strongestQuake) client-side.
   */
  private mergeData(partial: Partial<Pick<EarthData, 'flights' | 'quakes' | 'fires'>>): void {
    const current = this.data$.value;
    const flights = partial.flights ?? current?.flights ?? [];
    const quakes = partial.quakes ?? current?.quakes ?? [];
    const fires = partial.fires ?? current?.fires ?? [];
    const meta = computeMeta(flights, quakes, fires);

    this.data$.next({
      flights,
      quakes,
      fires,
      iss: current?.iss ?? null,
      timestamp: Date.now(),
      meta,
    });
    this.lastUpdate$.next(new Date());
    this.errorSubject$.next(null);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

function computeMeta(
  flights: FlightPoint[],
  quakes: QuakePoint[],
  fires: FirePoint[],
) {
  const strongestQuake =
    quakes.length > 0
      ? quakes.reduce((max, q) => (q.magnitude > max.magnitude ? q : max))
      : null;

  return {
    flightCount: flights.length,
    quakeCount: quakes.length,
    fireCount: fires.length,
    strongestQuake,
  };
}

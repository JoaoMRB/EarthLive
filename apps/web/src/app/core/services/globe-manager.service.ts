import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { Subject, Subscription, throttleTime } from 'rxjs';
import type {
  EarthData,
  FirePoint,
  FlightPoint,
  ISSPosition,
  QuakePoint,
  SelectablePoint,
} from '../models/earth-data.model';
import {
  boundsFromPov,
  limitsForPov,
  shouldCullToViewport,
  type GlobePov,
} from '../utils/globe-viewport';
import { projectIssOrbit, type OrbitCoord } from '../utils/iss-orbit';
import { GlobeDataWorkerService } from './globe-data-worker.service';
import type { LayerVisibility } from './layer-state.service';

interface IssOrbitPath {
  coords: OrbitCoord[];
}

// Using the Globe instance type from globe.gl library
type GlobeInstance = any;

interface HexBinAggregate {
  points: FirePoint[];
  sumWeight: number;
  center: { lat: number; lng: number };
}

interface FlightTrail {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
}

@Injectable({ providedIn: 'root' })
export class GlobeManagerService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly workerBus = inject(GlobeDataWorkerService);

  private globe: GlobeInstance | null = null;
  private container: HTMLElement | null = null;
  private resizeHandler: (() => void) | null = null;
  private selectHandler: ((point: SelectablePoint | null) => void) | null =
    null;
  private subs = new Subscription();
  private readonly cameraMoved$ = new Subject<void>();
  private currentRequestId = 0;
  private selected: SelectablePoint | null = null;
  private activeTourTimers: number[] = [];

  private snapshot: {
    data: EarthData | null;
    layers: LayerVisibility;
    flights: FlightPoint[];
    quakes: QuakePoint[];
    fires: FirePoint[];
  } = {
    data: null,
    layers: { flights: true, quakes: true, fires: true, iss: true },
    flights: [],
    quakes: [],
    fires: [],
  };

  bindSelection(handler: (point: SelectablePoint | null) => void): void {
    this.selectHandler = handler;
  }

  setSelection(point: SelectablePoint | null): void {
    this.stopTour();
    this.selected = point;
    this.paintLayers();
  }

  async mount(container: HTMLElement): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || this.globe) return;
    this.container = container;

    const [{ default: Globe }] = await Promise.all([import('globe.gl')]);

    this.globe = new Globe(container)
      .globeImageUrl(
        'https://cdn.jsdelivr.net/gh/vasturiano/three-globe@master/example/img/earth-blue-marble.jpg',
      )
      .bumpImageUrl(
        'https://cdn.jsdelivr.net/gh/vasturiano/three-globe@master/example/img/earth-elevation.jpg',
      )
      .backgroundImageUrl(
        '//unpkg.com/three-globe/example/img/night-sky.png',
      )
      .showAtmosphere(true)
      .atmosphereColor('#7dd3fc')
      .atmosphereAltitude(0.25)
      .pointOfView({ lat: 18, lng: -24, altitude: 2.1 }, 0)
      .width(container.clientWidth)
      .height(container.clientHeight);

    const material = this.globe.globeMaterial();
    material.color.set('#4a5568');
    material.emissive.set('#0f172a');
    material.emissiveIntensity = 0.25;
    material.shininess = 0.9;

    const controls = this.globe.controls?.();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.24;
      controls.enablePan = false;
      controls.minDistance = 160;
      controls.maxDistance = 420;
    }

    this.attachClickHandlers();
    this.attachCameraThrottle();

    this.resizeHandler = () => {
      if (this.globe && this.container) {
        this.globe.width(this.container.clientWidth);
        this.globe.height(this.container.clientHeight);
      }
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  update(data: EarthData | null, layers: LayerVisibility): void {
    if (!this.globe || !data) return;

    this.snapshot = {
      data,
      layers,
      flights: this.snapshot.flights,
      quakes: data.quakes,
      fires: this.snapshot.fires,
    };

    this.paintLayers();
    this.requestViewportProcess();
    this.paintIss(data.iss, layers.iss);
  }

  destroy(): void {
    this.ngOnDestroy();
  }

  ngOnDestroy(): void {
    this.stopTour();
    this.subs.unsubscribe();
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.globe = null;
    this.container = null;
    this.selectHandler = null;
  }

  focusOnPoint(point: SelectablePoint, duration = 1800): void {
    if (!this.globe) return;

    this.stopTour();
    this.selected = point;
    this.paintLayers();
    this.selectHandler?.(point);

    const altitude =
      point.kind === 'iss'
        ? 1.5
        : point.kind === 'flight'
          ? 0.72
          : point.kind === 'quake'
            ? 0.95
            : 0.82;

    this.globe.pointOfView(
      {
        lat: point.data.lat,
        lng: point.data.lng,
        altitude,
      },
      duration,
    );
  }

  playStoryTour(points: SelectablePoint[]): void {
    if (!this.globe || points.length === 0) return;

    this.stopTour();

    points.forEach((point, index) => {
      const timer = window.setTimeout(() => {
        this.focusOnPoint(point, 2200);
      }, index * 3200);
      this.activeTourTimers.push(timer);
    });
  }

  stopTour(): void {
    for (const timer of this.activeTourTimers) {
      window.clearTimeout(timer);
    }
    this.activeTourTimers = [];
  }

  private attachCameraThrottle(): void {
    this.subs.add(
      this.workerBus.processed$.subscribe((result) => {
        if (result.id !== this.currentRequestId) return;
        this.snapshot.flights = result.flights;
        this.snapshot.quakes = result.quakes;
        this.snapshot.fires = result.fires;
        this.paintLayers();
      }),
    );

    this.subs.add(
      this.cameraMoved$.pipe(throttleTime(450)).subscribe(() => {
        this.requestViewportProcess();
      }),
    );

    const controls = this.globe?.controls?.();
    if (controls) {
      const onChange = () => this.cameraMoved$.next();
      controls.addEventListener('change', onChange);
      this.subs.add({
        unsubscribe: () => controls.removeEventListener('change', onChange),
      });
    }
  }

  private getPov(): GlobePov {
    const pov = this.globe?.pointOfView?.() ?? { lat: 0, lng: 0, altitude: 2.5 };
    return {
      lat: pov.lat ?? 0,
      lng: pov.lng ?? 0,
      altitude: pov.altitude ?? 2.5,
    };
  }

  private requestViewportProcess(): void {
    const data = this.snapshot.data;
    if (!data || !this.globe) return;

    const pov = this.getPov();
    const bounds = boundsFromPov(pov);
    const cullToViewport = shouldCullToViewport(pov);
    const limits = limitsForPov(pov);
    const layers = this.snapshot.layers;

    this.currentRequestId = this.workerBus.enqueue({
      flights: data.flights,
      fires: data.fires,
      quakes: data.quakes,
      bounds,
      cullToViewport,
      limits,
      layers: {
        flights: layers.flights,
        quakes: layers.quakes,
        fires: layers.fires,
      },
    });
  }

  private paintIss(iss: ISSPosition | null, enabled: boolean): void {
    if (!this.globe) return;
    const issLabels = enabled && iss ? [iss] : [];
    const issSelected = this.selected?.kind === 'iss';
    const orbitPaths: IssOrbitPath[] =
      enabled && iss
        ? [{ coords: projectIssOrbit(iss.lat, iss.lng) }]
        : [];

    this.globe
      .pathsData(orbitPaths)
      .pathPoints('coords')
      .pathPointLat((p: OrbitCoord) => p.lat)
      .pathPointLng((p: OrbitCoord) => p.lng)
      .pathColor(() =>
        issSelected ? 'rgba(253, 224, 71, 0.7)' : 'rgba(174, 255, 255, 0.4)',
      )
      .pathStroke(issSelected ? 0.35 : 0.2)
      .labelsData(issLabels)
      .labelLat((d: ISSPosition) => d.lat)
      .labelLng((d: ISSPosition) => d.lng)
      .labelAltitude(0.035)
      .labelText(() => 'ISS')
      .labelSize(issSelected ? 1.6 : 1.2)
      .labelDotRadius(issSelected ? 0.45 : 0.25)
      .labelColor(() => (issSelected ? '#fde047' : '#aef'));
  }

  private paintLayers(): void {
    if (!this.globe) return;

    const { flights, quakes, fires, layers, data } = this.snapshot;
    const sel = this.selected;
    const flightTrails = layers.flights
      ? flights.map((flight) => buildFlightTrail(flight))
      : [];

    this.globe
      .arcsData(flightTrails)
      .arcStartLat((d: FlightTrail) => d.startLat)
      .arcStartLng((d: FlightTrail) => d.startLng)
      .arcEndLat((d: FlightTrail) => d.endLat)
      .arcEndLng((d: FlightTrail) => d.endLng)
      .arcColor((d: FlightTrail) => d.color)
      .arcAltitude(0.08)
      .arcStroke(0.35)
      .arcDashLength(0.35)
      .arcDashGap(1.4)
      .arcDashAnimateTime(2200)
      .pointsData(layers.flights ? flights : [])
      .pointLat((d: FlightPoint) => d.lat)
      .pointLng((d: FlightPoint) => d.lng)
      .pointAltitude((d: FlightPoint) => Math.min(d.alt / 12_000_000, 0.08))
      .pointRadius((d: FlightPoint) =>
        sel?.kind === 'flight' && sel.data.id === d.id ? 0.34 : 0.14,
      )
      .pointColor((d: FlightPoint) =>
        sel?.kind === 'flight' && sel.data.id === d.id
          ? '#fde68a'
          : altitudeColor(d.alt),
      )
      .ringsData(layers.quakes ? quakes : [])
      .ringLat((d: QuakePoint) => d.lat)
      .ringLng((d: QuakePoint) => d.lng)
      .ringMaxRadius((d: QuakePoint) => {
        const highlighted =
          sel?.kind === 'quake' && sel.data.id === d.id;
        return highlighted
          ? Math.max(2, d.magnitude * 2.2)
          : Math.max(0.5, d.magnitude * 1.5);
      })
      .ringPropagationSpeed(2)
      .ringRepeatPeriod((d: QuakePoint) =>
        Math.max(400, 1200 / Math.max(d.magnitude, 0.5)),
      )
      .ringColor((d: QuakePoint) => {
        const highlighted =
          sel?.kind === 'quake' && sel.data.id === d.id;
        return (t: number) =>
          highlighted
            ? `rgba(251, 191, 36, ${1 - t * 0.4})`
            : `rgba(255, ${Math.floor(80 + (1 - t) * 120)}, 0, ${1 - t * 0.6})`;
      })
      .hexBinPointsData(layers.fires ? fires : [])
      .hexBinPointLat((d: FirePoint) => d.lat)
      .hexBinPointLng((d: FirePoint) => d.lng)
      .hexBinResolution(
        this.getPov().altitude > 1.2 ? 2 : 3,
      )
      .hexMargin(0.18)
      .hexAltitude((d: { sumWeight: number }) => d.sumWeight * 0.00075)
      .hexTopColor((d: HexBinAggregate) => {
        // Highlight se este hexbin contém o ponto selecionado
        if (sel?.kind === 'fire' && d.points?.length) {
          const selectedFire = sel.data;
          const isContained = d.points.some(
            (f) =>
              Math.abs(f.lat - selectedFire.lat) < 0.01 &&
              Math.abs(f.lng - selectedFire.lng) < 0.01,
          );
          if (isContained) {
            return 'rgba(253, 224, 71, 0.95)';
          }
        }
        return `rgba(255, ${Math.max(72, 190 - d.sumWeight * 7)}, 24, 0.82)`;
      })
      .hexSideColor(() => 'rgba(255, 120, 48, 0.18)')
      .hexTopCurvatureResolution(0);

    if (data) {
      this.paintIss(data.iss, layers.iss);
    }
  }

  private attachClickHandlers(): void {
    if (!this.globe) return;

    this.globe
      .onPointClick((flight: FlightPoint) => {
        if (!this.snapshot.layers.flights) return;
        this.emitSelect({ kind: 'flight', data: flight });
      })
      .onLabelClick((iss: ISSPosition) => {
        if (!this.snapshot.layers.iss) return;
        this.emitSelect({ kind: 'iss', data: iss });
      })
      .onHexClick((hex: HexBinAggregate) => {
        if (!this.snapshot.layers.fires) return;
        const fire = pickFireFromHex(hex);
        if (fire) this.emitSelect({ kind: 'fire', data: fire });
      })
      .onGlobeClick(({ lat, lng }: { lat: number; lng: number }) => {
        if (!this.snapshot.layers.quakes) {
          this.emitSelect(null);
          return;
        }
        const quake = findNearestQuake(this.snapshot.quakes, lat, lng);
        this.emitSelect(quake ? { kind: 'quake', data: quake } : null);
      });
  }

  private emitSelect(point: SelectablePoint | null): void {
    this.stopTour();
    this.selected = point;
    this.paintLayers();
    this.selectHandler?.(point);
  }
}

function altitudeColor(altMeters: number): string {
  if (altMeters < 3000) return '#34d399';
  if (altMeters < 8000) return '#38bdf8';
  return '#818cf8';
}

function buildFlightTrail(flight: FlightPoint): FlightTrail {
  const headingRadians = (flight.heading * Math.PI) / 180;
  const distance = Math.max(0.6, Math.min(2.2, flight.speed / 520));
  const endLat = flight.lat + Math.cos(headingRadians) * distance;
  const endLng =
    flight.lng + (Math.sin(headingRadians) * distance) / Math.max(0.3, Math.cos((flight.lat * Math.PI) / 180));

  return {
    startLat: flight.lat,
    startLng: flight.lng,
    endLat: clampLatitude(endLat),
    endLng: wrapLongitude(endLng),
    color: altitudeColor(flight.alt),
  };
}

function findNearestQuake(
  quakes: QuakePoint[],
  lat: number,
  lng: number,
): QuakePoint | null {
  let best: QuakePoint | null = null;
  let bestScore = Infinity;

  for (const q of quakes) {
    const dist = Math.hypot(q.lat - lat, q.lng - lng);
    const threshold = Math.max(1.5, q.magnitude * 0.8);
    if (dist < threshold && dist < bestScore) {
      bestScore = dist;
      best = q;
    }
  }

  return best;
}

function pickFireFromHex(hex: HexBinAggregate): FirePoint | null {
  if (hex.points?.length) {
    return hex.points.reduce((a, b) =>
      b.brightness > a.brightness ? b : a,
    );
  }
  if (hex.center) {
    return {
      lat: hex.center.lat,
      lng: hex.center.lng,
      brightness: hex.sumWeight ?? 0,
      confidence: 'nominal',
      datetime: '',
    };
  }
  return null;
}

function clampLatitude(value: number): number {
  return Math.max(-85, Math.min(85, value));
}

function wrapLongitude(value: number): number {
  if (value > 180) return value - 360;
  if (value < -180) return value + 360;
  return value;
}

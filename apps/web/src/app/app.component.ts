import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import type { EarthData, FirePoint, FlightPoint, SelectablePoint } from './core/models/earth-data.model';
import { GlobeComponent } from './features/globe/globe.component';
import { LayerToggleComponent } from './features/control-panel/layer-toggle.component';
import { InfoPanelComponent } from './features/control-panel/info-panel.component';
import { EarthDataService } from './core/services/earth-data.service';
import {
  LayerStateService,
  type LayerPreset,
} from './core/services/layer-state.service';
import { GlobeManagerService } from './core/services/globe-manager.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    AsyncPipe,
    CommonModule,
    GlobeComponent,
    LayerToggleComponent,
    InfoPanelComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly earthDataService = inject(EarthDataService);
  readonly layerStateService = inject(LayerStateService);
  readonly globeManager = inject(GlobeManagerService);
  
  readonly selectedPoint = toSignal(this.layerStateService.selected$, {
    initialValue: null,
  });

  readonly snapshot$ = this.earthDataService.earthData$.pipe(
    map((data) => buildSnapshot(data)),
  );

  readonly desktopTab = signal('overview');
  readonly mobileTab = signal('overview');
  readonly mobileSheetOpen = signal(true);
  readonly desktopPanelCollapsed = signal(false);
  readonly activePreset = signal<LayerPreset>('all');

  constructor() {
    this.earthDataService.startPolling();

    effect(() => {
      const selected = this.selectedPoint();
      if (!selected) return;

      this.desktopTab.set('selection');
      this.mobileTab.set('selection');
      this.mobileSheetOpen.set(true);
      this.desktopPanelCollapsed.set(false);
    });
  }

  toggleMobileSheet(): void {
    this.mobileSheetOpen.update((open) => !open);
  }

  clearSelection(): void {
    this.desktopTab.set('overview');
    this.mobileTab.set('overview');
    this.layerStateService.select(null);
    this.globeManager.stopTour();
  }

  setDesktopTab(tab: string | undefined): void {
    this.desktopTab.set(tab ?? 'overview');
  }

  setMobileTab(tab: string | undefined): void {
    this.mobileTab.set(tab ?? 'overview');
  }

  openPanel(tab: 'overview' | 'layers' | 'selection'): void {
    this.desktopTab.set(tab);
    this.mobileTab.set(tab);
    this.mobileSheetOpen.set(true);
    this.desktopPanelCollapsed.set(false);
  }

  toggleDesktopPanel(): void {
    this.desktopPanelCollapsed.update((collapsed) => !collapsed);
  }

  applyPreset(preset: LayerPreset): void {
    this.activePreset.set(preset);
    this.layerStateService.applyPreset(preset);
    this.desktopTab.set('overview');
  }

  focusTopEvent(kind: 'quake' | 'fire' | 'flight' | 'iss'): void {
    const point = pickFeaturedPoint(this.earthDataService.currentData, kind);
    if (!point) return;

    this.activePreset.set(kind === 'iss' ? 'space' : kind === 'flight' ? 'flights' : 'disasters');
    this.layerStateService.applyPreset(this.activePreset());
    this.globeManager.focusOnPoint(point);
  }

  // Inicia o tour de eventos ao vivo
  takeMeSomewhereActive(): void {
    const data = this.earthDataService.currentData;
    if (!data) return;

    const tourStops = buildTourStops(data);
    if (tourStops.length === 0) return;

    this.activePreset.set('all');
    this.layerStateService.applyPreset('all');
    this.desktopPanelCollapsed.set(true);
    this.globeManager.playStoryTour(tourStops);
  }
}

interface Snapshot {
  flights: number;
  quakes: number;
  fires: number;
  strongestQuake: string;
  issTrack: string;
  topEvents: Array<{
    kind: 'quake' | 'fire' | 'flight' | 'iss';
    title: string;
    eyebrow: string;
    detail: string;
  }>;
}

function buildSnapshot(data: EarthData | null): Snapshot {
  const strongest = data?.meta.strongestQuake ?? null;
  const hottestFire = data?.fires.reduce<FirePoint | null>(
    (max, fire) => (!max || fire.brightness > max.brightness ? fire : max),
    null,
  ) ?? null;
  const fastestFlight = data?.flights.reduce<FlightPoint | null>(
    (max, flight) => (!max || flight.speed > max.speed ? flight : max),
    null,
  ) ?? null;
  const iss = data?.iss ?? null;

  return {
    flights: data?.meta.flightCount ?? 0,
    quakes: data?.meta.quakeCount ?? 0,
    fires: data?.meta.fireCount ?? 0,
    strongestQuake: strongest
      ? `M${strongest.magnitude.toFixed(1)} ${strongest.place}`
      : 'No strong quake right now',
    issTrack: iss
      ? `${Math.abs(iss.lat).toFixed(1)}${iss.lat >= 0 ? 'N' : 'S'} / ${Math.abs(iss.lng).toFixed(1)}${iss.lng >= 0 ? 'E' : 'W'}`
      : 'Tracking standby',
    topEvents: [
      {
        kind: 'quake' as const,
        title: strongest ? `Magnitude ${strongest.magnitude.toFixed(1)}` : 'No major quake',
        eyebrow: 'Strongest quake',
        detail: strongest?.place ?? 'Waiting for seismic feed',
      },
      {
        kind: 'fire' as const,
        title: hottestFire ? `${Math.round(hottestFire.brightness)} brightness` : 'No fire hotspot',
        eyebrow: 'Hottest fire cluster',
        detail: hottestFire?.datetime || 'Waiting for thermal feed',
      },
      {
        kind: 'flight' as const,
        title: fastestFlight ? `${fastestFlight.speed} km/h` : 'No flight focus',
        eyebrow: 'Fastest sampled flight',
        detail: fastestFlight?.callsign || fastestFlight?.country || 'Air traffic sampling',
      },
      {
        kind: 'iss' as const,
        title: iss ? 'Orbital pass live' : 'ISS standby',
        eyebrow: 'Space focus',
        detail: iss
          ? `${Math.abs(iss.lat).toFixed(1)}${iss.lat >= 0 ? 'N' : 'S'} ${Math.abs(iss.lng).toFixed(1)}${iss.lng >= 0 ? 'E' : 'W'}`
          : 'Awaiting lock',
      },
    ],
  };
}

function pickFeaturedPoint(
  data: EarthData | null,
  kind: 'quake' | 'fire' | 'flight' | 'iss',
): SelectablePoint | null {
  if (!data) return null;

  switch (kind) {
    case 'quake': {
      const quake = data.meta.strongestQuake;
      return quake ? { kind: 'quake', data: quake } : null;
    }
    case 'fire': {
      const fire = data.fires.reduce<FirePoint | null>(
        (max, item) => (!max || item.brightness > max.brightness ? item : max),
        null,
      );
      return fire ? { kind: 'fire', data: fire } : null;
    }
    case 'flight': {
      const flight = data.flights.reduce<FlightPoint | null>(
        (max, item) => (!max || item.speed > max.speed ? item : max),
        null,
      );
      return flight ? { kind: 'flight', data: flight } : null;
    }
    case 'iss':
      return data.iss ? { kind: 'iss', data: data.iss } : null;
  }
}

function buildTourStops(data: EarthData): SelectablePoint[] {
  const stops = [
    pickFeaturedPoint(data, 'quake'),
    pickFeaturedPoint(data, 'fire'),
    pickFeaturedPoint(data, 'flight'),
    pickFeaturedPoint(data, 'iss'),
  ];

  return stops.filter((point): point is SelectablePoint => point !== null);
}

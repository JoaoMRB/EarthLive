import {
  Map as MLMap,
  setWorkerUrl,
  type GeoJSONSource,
  type ImageSource,
  type MapGeoJSONFeature,
  type ExpressionSpecification,
  type PointLike,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { config } from './config';
import type { RasterSpec } from './imagery';
import { MERC_LAT } from './weather';

export type Theme = 'light' | 'dark';
export type View = 'globe' | 'map';
export type DataLayer = 'flights' | 'quakes' | 'fires' | 'iss' | 'volcanoes' | 'storms';
/** Image overlays, drawn under the basemap labels, bottom → top. */
export const OVERLAYS = ['lights', 'satellite', 'aerosol', 'temp', 'wind', 'clouds', 'radar', 'daynight'] as const;
export type OverlayId = (typeof OVERLAYS)[number];
export type FC = GeoJSON.FeatureCollection;

export interface Palette {
  flights: string;
  quakes: string;
  fires: string;
  iss: string;
  volcanoes: string;
  storms: string;
  track: string;
  ring: string;
  space: string;
  horizon: string;
}

export const PALETTES: Record<Theme, Palette> = {
  dark: {
    flights: '#8FB4FF', quakes: '#F5B84D', fires: '#FF6A3D', iss: '#FFFFFF', volcanoes: '#E58BFF', storms: '#5ED6C8',
    track: 'rgba(255,255,255,0.45)', ring: '#FFFFFF', space: '#0B0C0E', horizon: '#2A3140',
  },
  light: {
    flights: '#3D6FE0', quakes: '#C47A08', fires: '#E0482A', iss: '#1C1D21', volcanoes: '#9B3FC4', storms: '#0F8A80',
    track: 'rgba(28,29,33,0.45)', ring: '#1C1D21', space: '#E9E7E2', horizon: '#FFFFFF',
  },
};

// MapLibre 6 runs tile parsing in a module worker; point it at the file Vite emits.
setWorkerUrl(workerUrl);

const EMPTY: FC = { type: 'FeatureCollection', features: [] };
const SOURCES = ['flights', 'quakes', 'fires', 'iss', 'iss-track', 'events', 'storm-tracks', 'selected'] as const;
export type SourceId = (typeof SOURCES)[number];

const LAYER_GROUPS: Record<DataLayer, string[]> = {
  fires: ['fires-heat', 'fires-dot'],
  quakes: ['quakes'],
  flights: ['flights-dot', 'flights-icon'],
  iss: ['iss-track', 'iss-halo', 'iss-dot'],
  volcanoes: ['volcanoes'],
  storms: ['storm-track', 'storms'],
};
const CLICKABLE = ['iss-dot', 'storms', 'volcanoes', 'quakes', 'flights-icon', 'flights-dot', 'fires-dot'];
const MERC_COORDS: [[number, number], [number, number], [number, number], [number, number]] = [
  [-180, MERC_LAT], [180, MERC_LAT], [180, -MERC_LAT], [-180, -MERC_LAT],
];

type Overlay =
  | { kind: 'raster'; spec: RasterSpec }
  | { kind: 'image'; url: string; opacity: number };

export type Pick =
  | { kind: DataLayer; feature: MapGeoJSONFeature }
  | { kind: 'place'; lngLat: [number, number] };

export class EarthMap {
  readonly map: MLMap;
  private theme: Theme;
  private view: View;
  private data: Record<SourceId, FC> = Object.fromEntries(SOURCES.map((s) => [s, EMPTY])) as Record<SourceId, FC>;
  private visible: Record<DataLayer, boolean> = {
    flights: true, quakes: true, fires: true, iss: true, volcanoes: true, storms: true,
  };
  private overlays = new Map<OverlayId, Overlay>();
  private overlayVisible = new Map<OverlayId, boolean>();
  private firstSymbol: string | undefined;
  private ready = false;
  private pickHandler: ((p: Pick | null) => void) | null = null;
  private styleListeners: (() => void)[] = [];

  constructor(container: HTMLElement, theme: Theme, view: View) {
    this.theme = theme;
    this.view = view;
    this.map = new MLMap({
      container,
      style: config.styles[theme],
      center: [-20, 25],
      zoom: window.innerWidth < 720 ? 0.9 : 2.1,
      minZoom: 0,
      maxZoom: 12,
      attributionControl: false, // attribution is rendered in the page footer
      renderWorldCopies: true,
      fadeDuration: 0,
    });
    this.map.on('style.load', () => this.onStyleLoad());
    // The basemap styles reference a few POI icons we don't use: fill them with
    // an empty image instead of logging warnings.
    this.map.setMissingStyleImageResolver((id) => {
      if (!this.map.hasImage(id)) this.map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
    this.map.on('click', (e) => this.onClick(e.point, [e.lngLat.lng, e.lngLat.lat]));
    this.map.on('mousemove', (e) => {
      const hit = this.ready && this.query(e.point).length > 0;
      this.map.getCanvas().style.cursor = hit ? 'pointer' : '';
    });
  }

  get isReady(): boolean {
    return this.ready;
  }

  onPick(handler: (p: Pick | null) => void): void {
    this.pickHandler = handler;
  }

  /** Called after every (re)load of the basemap style. */
  onStyle(fn: () => void): void {
    this.styleListeners.push(fn);
  }

  setTheme(theme: Theme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.ready = false;
    // diff:false → always a full reload, so 'style.load' fires and our layers are re-added.
    this.map.setStyle(config.styles[theme], { diff: false });
  }

  setView(view: View): void {
    this.view = view;
    if (this.ready) this.applyProjection();
  }

  setData(id: SourceId, fc: FC): void {
    this.data[id] = fc;
    if (!this.ready) return;
    (this.map.getSource(id) as GeoJSONSource | undefined)?.setData(fc);
  }

  setVisible(layer: DataLayer, on: boolean): void {
    this.visible[layer] = on;
    if (!this.ready) return;
    for (const id of LAYER_GROUPS[layer]) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    }
  }

  /** Tile overlay (satellite imagery, radar…). `null` removes it. */
  setRaster(id: OverlayId, spec: RasterSpec | null): void {
    if (spec) this.overlays.set(id, { kind: 'raster', spec });
    else this.overlays.delete(id);
    if (this.ready) this.mountOverlay(id);
  }

  /** Whole-world image overlay in Web Mercator (temperature, night shading…). */
  setImage(id: OverlayId, url: string | null, opacity = 1): void {
    const prev = this.overlays.get(id);
    if (url) this.overlays.set(id, { kind: 'image', url, opacity });
    else this.overlays.delete(id);
    if (!this.ready) return;
    const src = this.map.getSource(`ov-${id}`) as ImageSource | undefined;
    if (url && prev?.kind === 'image' && src) {
      src.updateImage({ url, coordinates: MERC_COORDS });
      this.map.setPaintProperty(`ov-${id}`, 'raster-opacity', opacity);
    } else {
      this.mountOverlay(id);
    }
  }

  setOverlayVisible(id: OverlayId, on: boolean): void {
    this.overlayVisible.set(id, on);
    if (this.ready && this.map.getLayer(`ov-${id}`)) {
      this.map.setLayoutProperty(`ov-${id}`, 'visibility', on ? 'visible' : 'none');
    }
  }

  // ----- internals -----

  private onStyleLoad(): void {
    const p = PALETTES[this.theme];
    this.firstSymbol = this.map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    this.addPlaneIcon(p.flights);
    this.addVolcanoIcon(p.volcanoes);
    for (const id of SOURCES) {
      if (!this.map.getSource(id)) this.map.addSource(id, { type: 'geojson', data: this.data[id] });
    }
    this.addLayers(p);
    this.ready = true;
    for (const id of OVERLAYS) this.mountOverlay(id);
    for (const k of Object.keys(this.visible) as DataLayer[]) this.setVisible(k, this.visible[k]);
    this.applyProjection();
    for (const fn of this.styleListeners) fn();
  }

  private mountOverlay(id: OverlayId): void {
    const layerId = `ov-${id}`;
    if (this.map.getLayer(layerId)) this.map.removeLayer(layerId);
    if (this.map.getSource(layerId)) this.map.removeSource(layerId);
    const ov = this.overlays.get(id);
    if (!ov) return;
    if (ov.kind === 'raster') {
      this.map.addSource(layerId, {
        type: 'raster',
        tiles: ov.spec.tiles,
        tileSize: ov.spec.tileSize ?? 256,
        maxzoom: ov.spec.maxzoom,
      });
    } else {
      this.map.addSource(layerId, { type: 'image', url: ov.url, coordinates: MERC_COORDS });
    }
    this.map.addLayer(
      {
        id: layerId,
        type: 'raster',
        source: layerId,
        layout: { visibility: this.overlayVisible.get(id) === false ? 'none' : 'visible' },
        paint: {
          'raster-opacity': ov.kind === 'raster' ? ov.spec.opacity : ov.opacity,
          'raster-fade-duration': 150,
          'raster-resampling': 'linear',
        },
      },
      this.firstSymbol,
    );
    // Keep the fixed bottom → top order, all under the basemap labels.
    for (const o of OVERLAYS) {
      if (this.map.getLayer(`ov-${o}`)) this.map.moveLayer(`ov-${o}`, this.firstSymbol);
    }
  }

  private applyProjection(): void {
    const p = PALETTES[this.theme];
    this.map.setProjection({ type: this.view === 'globe' ? 'globe' : 'mercator' });
    this.map.setSky({
      'sky-color': p.space,
      'horizon-color': p.horizon,
      'fog-color': p.space,
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.8,
      'fog-ground-blend': 0.9,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 4, 0.6, 7, 0],
    });
  }

  private addLayers(p: Palette): void {
    const m = this.map;
    const zoomScale = (base: ExpressionSpecification | number, k = 1.6): ExpressionSpecification =>
      ['interpolate', ['exponential', 1.6], ['zoom'], 0, base, 8, ['*', base, k * 3]];

    // Fires: soft heat at world scale, individual dots when zoomed in.
    m.addLayer({
      id: 'fires-heat',
      type: 'heatmap',
      source: 'fires',
      maxzoom: 7,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'frp'], 0, 0.1, 20, 0.4, 200, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.25, 4, 0.6, 6, 1.2],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 1.5, 3, 3.5, 6, 10],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 7, 0],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.1, hexA(p.fires, 0.25),
          0.45, hexA(p.fires, 0.6),
          1, this.theme === 'dark' ? '#FFB27A' : '#B3260E',
        ],
      },
    });
    m.addLayer({
      id: 'fires-dot',
      type: 'circle',
      source: 'fires',
      minzoom: 5,
      paint: {
        'circle-color': p.fires,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 1.5, 10, 5],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 6, 0.85],
      },
    });

    // Earthquakes: ring sized by magnitude, fading with age.
    m.addLayer({
      id: 'quakes',
      type: 'circle',
      source: 'quakes',
      paint: {
        'circle-radius': zoomScale(['interpolate', ['linear'], ['get', 'mag'], 0, 2, 3, 4, 5, 9, 7, 20], 1),
        'circle-color': hexA(p.quakes, 0.22),
        'circle-stroke-color': p.quakes,
        'circle-stroke-width': 1.3,
        'circle-opacity': ['interpolate', ['linear'], ['get', 'ageH'], 0, 1, 24, 0.75, 168, 0.4],
        'circle-stroke-opacity': ['interpolate', ['linear'], ['get', 'ageH'], 0, 1, 24, 0.8, 168, 0.45],
        'circle-pitch-alignment': 'map',
      },
    });

    // Storms: track + current position. Volcanoes: triangle markers.
    m.addLayer({
      id: 'storm-track',
      type: 'line',
      source: 'storm-tracks',
      paint: { 'line-color': p.storms, 'line-width': 1.6, 'line-opacity': 0.7, 'line-dasharray': [1, 1.5] },
    });
    m.addLayer({
      id: 'storms',
      type: 'circle',
      source: 'events',
      filter: ['==', ['get', 'kind'], 'storms'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 6, 6, 11],
        'circle-color': hexA(p.storms, 0.25),
        'circle-stroke-color': p.storms,
        'circle-stroke-width': 2,
      },
    });
    m.addLayer({
      id: 'volcanoes',
      type: 'symbol',
      source: 'events',
      filter: ['==', ['get', 'kind'], 'volcanoes'],
      layout: {
        'icon-image': 'el-volcano',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 0, 0.55, 6, 0.9],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });

    // Flights: tiny dots at world scale, plane icons when zoomed in.
    m.addLayer({
      id: 'flights-dot',
      type: 'circle',
      source: 'flights',
      maxzoom: 4.5,
      paint: {
        'circle-color': p.flights,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 1, 4.5, 2.4],
        'circle-opacity': 0.8,
      },
    });
    m.addLayer({
      id: 'flights-icon',
      type: 'symbol',
      source: 'flights',
      minzoom: 4.5,
      layout: {
        'icon-image': 'el-plane',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 4.5, 0.45, 10, 0.9],
        'icon-rotate': ['get', 'heading'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });

    // ISS
    m.addLayer({
      id: 'iss-track',
      type: 'line',
      source: 'iss-track',
      paint: { 'line-color': p.track, 'line-width': 1.4, 'line-dasharray': [2, 2] },
    });
    m.addLayer({
      id: 'iss-halo',
      type: 'circle',
      source: 'iss',
      paint: {
        'circle-radius': 16,
        'circle-color': hexA(p.iss, 0.1),
        'circle-stroke-color': hexA(p.iss, 0.55),
        'circle-stroke-width': 1,
      },
    });
    m.addLayer({
      id: 'iss-dot',
      type: 'circle',
      source: 'iss',
      paint: {
        'circle-radius': 5.5,
        'circle-color': p.iss,
        'circle-stroke-color': this.theme === 'dark' ? '#0B0C0E' : '#FFFFFF',
        'circle-stroke-width': 1.5,
      },
    });

    // Selection ring(s)
    m.addLayer({
      id: 'selected',
      type: 'circle',
      source: 'selected',
      paint: {
        'circle-radius': 14,
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': p.ring,
        'circle-stroke-width': 2,
      },
    });
  }

  private drawIcon(name: string, draw: (ctx: CanvasRenderingContext2D) => void): void {
    if (this.map.hasImage(name)) this.map.removeImage(name);
    const size = 48;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.translate(size / 2, size / 2);
    ctx.scale(size / 24, size / 24);
    draw(ctx);
    this.map.addImage(name, ctx.getImageData(0, 0, size, size), { pixelRatio: 2 });
  }

  private addPlaneIcon(color: string): void {
    // Top-down airliner silhouette, nose pointing up (heading 0 = north).
    this.drawIcon('el-plane', (ctx) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.bezierCurveTo(1.2, -11, 1.4, -9, 1.4, -7);
      ctx.lineTo(1.4, -2.5);
      ctx.lineTo(10, 2.5);
      ctx.lineTo(10, 4.2);
      ctx.lineTo(1.4, 1.6);
      ctx.lineTo(1.2, 7);
      ctx.lineTo(4, 9.2);
      ctx.lineTo(4, 10.6);
      ctx.lineTo(0, 9.6);
      ctx.lineTo(-4, 10.6);
      ctx.lineTo(-4, 9.2);
      ctx.lineTo(-1.2, 7);
      ctx.lineTo(-1.4, 1.6);
      ctx.lineTo(-10, 4.2);
      ctx.lineTo(-10, 2.5);
      ctx.lineTo(-1.4, -2.5);
      ctx.lineTo(-1.4, -7);
      ctx.bezierCurveTo(-1.4, -9, -1.2, -11, 0, -11);
      ctx.fill();
    });
  }

  private addVolcanoIcon(color: string): void {
    this.drawIcon('el-volcano', (ctx) => {
      ctx.fillStyle = hexA(color, 0.3);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(8, 7);
      ctx.lineTo(-8, 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }

  private query(point: PointLike): MapGeoJSONFeature[] {
    const p = point as { x: number; y: number };
    const layers = CLICKABLE.filter((id) => this.map.getLayer(id));
    return this.map.queryRenderedFeatures(
      [[p.x - 6, p.y - 6], [p.x + 6, p.y + 6]],
      { layers },
    );
  }

  private onClick(point: PointLike, lngLat: [number, number]): void {
    if (!this.ready) return;
    const hits = this.query(point);
    const order = (id: string) => CLICKABLE.indexOf(id);
    hits.sort((a, b) => order(a.layer.id) - order(b.layer.id));
    const f = hits[0];
    if (!f) return this.pickHandler?.({ kind: 'place', lngLat });
    const id = f.layer.id;
    const kind: DataLayer = id.startsWith('iss')
      ? 'iss'
      : id === 'storms'
        ? 'storms'
        : id === 'volcanoes'
          ? 'volcanoes'
          : id === 'quakes'
            ? 'quakes'
            : id.startsWith('flights')
              ? 'flights'
              : 'fires';
    this.pickHandler?.({ kind, feature: f });
  }
}

/** '#RRGGBB' + alpha → 'rgba(...)'. Non-hex colours are returned unchanged. */
export function hexA(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

import { Map as MLMap } from 'maplibre-gl';
import { config } from './config';
import type { RasterSpec } from './imagery';
import { getLang, type Lang } from './i18n';
import { PALETTES, localizeLabels, type Theme, type View } from './map';

/**
 * Split-screen comparison: a second map drawn on top of the main one and
 * clipped to the right of a draggable divider. Synced = same place, two
 * dates. Unsynced = each side can be moved to a different place.
 */
export class CompareView {
  private root: HTMLDivElement;
  private map: MLMap;
  private divider: HTMLDivElement;
  private pos = 0.5;
  private synced = true;
  private syncing = false;
  private spec: RasterSpec | null = null;
  private onMainMove = () => this.follow(this.main, this.map);
  private onSideMove = () => this.follow(this.map, this.main);

  constructor(private main: MLMap, private theme: Theme, private view: View) {
    this.root = document.createElement('div');
    this.root.className = 'compare';
    const mapEl = document.createElement('div');
    mapEl.className = 'compare-map';
    this.root.append(mapEl);

    this.divider = document.createElement('div');
    this.divider.className = 'compare-divider';
    const knob = document.createElement('button');
    knob.type = 'button';
    knob.className = 'compare-knob';
    knob.setAttribute('aria-label', 'Mover divisória (setas esquerda/direita)');
    knob.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6-6 6 6 6M15 6l6 6-6 6"/></svg>';
    this.divider.append(knob);
    main.getContainer().parentElement!.append(this.root, this.divider);

    const c = main.getCenter();
    this.map = new MLMap({
      container: mapEl,
      style: config.styles[theme],
      center: [c.lng, c.lat],
      zoom: main.getZoom(),
      bearing: main.getBearing(),
      pitch: main.getPitch(),
      attributionControl: false,
      fadeDuration: 0,
    });
    this.map.setMissingStyleImageResolver((id) => {
      if (!this.map.hasImage(id)) this.map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
    this.map.on('style.load', () => this.onStyle());
    main.on('move', this.onMainMove);
    this.map.on('move', this.onSideMove);

    // Drag the divider
    let dragging = false;
    const setFromX = (x: number) => {
      const w = this.root.clientWidth;
      this.setPos(Math.max(0.05, Math.min(0.95, x / w)));
    };
    this.divider.addEventListener('pointerdown', (e) => {
      dragging = true;
      this.divider.setPointerCapture(e.pointerId);
    });
    this.divider.addEventListener('pointermove', (e) => dragging && setFromX(e.clientX));
    this.divider.addEventListener('pointerup', () => (dragging = false));
    knob.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this.setPos(Math.max(0.05, this.pos - 0.05));
      if (e.key === 'ArrowRight') this.setPos(Math.min(0.95, this.pos + 0.05));
    });
    this.setPos(0.5);
  }

  setRaster(spec: RasterSpec | null): void {
    this.spec = spec;
    if (this.map.isStyleLoaded()) this.mount();
  }

  setLanguage(lang: Lang): void {
    if (this.map.isStyleLoaded()) localizeLabels(this.map, lang);
  }

  setSynced(on: boolean): void {
    this.synced = on;
    if (on) this.follow(this.main, this.map);
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.map.setStyle(config.styles[theme], { diff: false });
  }

  setView(view: View): void {
    this.view = view;
    if (this.map.isStyleLoaded()) this.map.setProjection({ type: view === 'globe' ? 'globe' : 'mercator' });
  }

  destroy(): void {
    this.main.off('move', this.onMainMove);
    this.map.remove();
    this.root.remove();
    this.divider.remove();
  }

  private setPos(p: number): void {
    this.pos = p;
    const pct = `${(p * 100).toFixed(2)}%`;
    this.root.style.clipPath = `inset(0 0 0 ${pct})`;
    this.divider.style.left = pct;
  }

  private follow(from: MLMap, to: MLMap): void {
    if (!this.synced || this.syncing) return;
    this.syncing = true;
    to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: from.getBearing(), pitch: from.getPitch() });
    this.syncing = false;
  }

  private onStyle(): void {
    const p = PALETTES[this.theme];
    this.map.setProjection({ type: this.view === 'globe' ? 'globe' : 'mercator' });
    this.map.setSky({ 'sky-color': p.space, 'horizon-color': p.horizon, 'fog-color': p.space, 'atmosphere-blend': 0.8 });
    localizeLabels(this.map, getLang());
    this.mount();
  }

  private mount(): void {
    if (this.map.getLayer('cmp')) this.map.removeLayer('cmp');
    if (this.map.getSource('cmp')) this.map.removeSource('cmp');
    if (!this.spec) return;
    const firstSymbol = this.map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    this.map.addSource('cmp', {
      type: 'raster',
      tiles: this.spec.tiles,
      tileSize: this.spec.tileSize ?? 256,
      maxzoom: this.spec.maxzoom,
    });
    this.map.addLayer(
      { id: 'cmp', type: 'raster', source: 'cmp', paint: { 'raster-opacity': this.spec.opacity, 'raster-fade-duration': 150 } },
      firstSymbol,
    );
  }
}

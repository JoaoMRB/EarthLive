import type { Map as MLMap } from 'maplibre-gl';
import { sample, type WeatherGrid } from './weather';

interface Particle {
  lng: number;
  lat: number;
  age: number;
  maxAge: number;
  px: number; // last screen position (NaN = not drawn yet)
  py: number;
}

const RAD = Math.PI / 180;

/**
 * Animated wind streamlines drawn on a canvas above the map. Particles live in
 * geographic coordinates and are projected each frame, so they work on both the
 * globe and the flat map.
 */
export class WindParticles {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private grid: WeatherGrid | null = null;
  private running = false;
  private raf = 0;
  private moving = false;
  private color = 'rgba(255,255,255,0.8)';
  private dpr = Math.min(window.devicePixelRatio || 1, 2);

  constructor(private map: MLMap) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'wind-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    map.getContainer().appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    map.on('resize', () => this.resize());
    map.on('movestart', () => {
      this.moving = true;
      this.clear();
    });
    map.on('moveend', () => {
      this.moving = false;
      this.clear();
      this.respawnAll();
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? this.pause() : this.resume()));
  }

  setGrid(g: WeatherGrid): void {
    this.grid = g;
  }

  setTheme(dark: boolean): void {
    this.color = dark ? 'rgba(255,255,255,0.85)' : 'rgba(28,29,33,0.7)';
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.canvas.style.display = '';
    this.respawnAll();
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.clear();
    this.canvas.style.display = 'none';
  }

  private pause(): void {
    cancelAnimationFrame(this.raf);
  }

  private resume(): void {
    if (this.running) this.loop();
  }

  private resize(): void {
    const c = this.map.getContainer();
    this.canvas.width = Math.round(c.clientWidth * this.dpr);
    this.canvas.height = Math.round(c.clientHeight * this.dpr);
    this.canvas.style.width = `${c.clientWidth}px`;
    this.canvas.style.height = `${c.clientHeight}px`;
    this.respawnAll();
  }

  private clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const p of this.particles) p.px = NaN;
  }

  private targetCount(): number {
    const area = (this.canvas.width * this.canvas.height) / (this.dpr * this.dpr);
    return Math.min(4500, Math.round(area / 330));
  }

  private respawnAll(): void {
    const n = this.targetCount();
    this.particles = [];
    for (let i = 0; i < n; i++) {
      const p: Particle = { lng: 0, lat: 0, age: 0, maxAge: 0, px: NaN, py: NaN };
      this.spawn(p);
      p.age = Math.floor(Math.random() * p.maxAge);
      this.particles.push(p);
    }
  }

  /** Puts a particle at a random visible spot on the Earth. */
  private spawn(p: Particle): void {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    for (let tries = 0; tries < 6; tries++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const ll = this.map.unproject([x, y]);
      // On the globe, unproject() of a point in space returns the nearest edge:
      // re-project to check the point really is on the Earth.
      const back = this.map.project(ll);
      if (Math.abs(back.x - x) < 2 && Math.abs(back.y - y) < 2 && Math.abs(ll.lat) < 84) {
        p.lng = ll.lng;
        p.lat = ll.lat;
        break;
      }
    }
    p.age = 0;
    p.maxAge = 40 + Math.random() * 80;
    p.px = NaN;
  }

  private loop = (): void => {
    if (!this.running || document.hidden) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.grid || this.moving) return;

    const ctx = this.ctx;
    const g = this.grid;
    const globe = this.map.getProjection()?.type === 'globe';
    const center = this.map.getCenter();
    const cLat = center.lat * RAD;
    const cLng = center.lng * RAD;
    const zoom = this.map.getZoom();
    // ~0.07 screen px per frame for each m/s of wind, whatever the zoom.
    const degPerPx = 360 / (512 * 2 ** zoom);
    const k = 0.07 * degPerPx;

    // Fade previous trails.
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = 'rgba(0,0,0,0.93)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.1 * this.dpr;
    ctx.lineCap = 'round';
    ctx.beginPath();

    for (const p of this.particles) {
      if (++p.age > p.maxAge) {
        this.spawn(p);
        continue;
      }
      const u = sample(g, g.u, p.lng, p.lat);
      const v = sample(g, g.v, p.lng, p.lat);
      p.lng += (u * k) / Math.max(0.2, Math.cos(p.lat * RAD));
      p.lat += v * k;
      if (p.lng > 180) p.lng -= 360;
      if (p.lng < -180) p.lng += 360;
      if (Math.abs(p.lat) > 84) {
        this.spawn(p);
        continue;
      }
      if (globe) {
        // Hidden on the far side of the globe?
        const pl = p.lat * RAD;
        const dot =
          Math.sin(pl) * Math.sin(cLat) + Math.cos(pl) * Math.cos(cLat) * Math.cos(p.lng * RAD - cLng);
        if (dot < 0.08) {
          this.spawn(p);
          continue;
        }
      }
      const s = this.map.project([p.lng, p.lat]);
      const x = s.x * this.dpr;
      const y = s.y * this.dpr;
      if (x < 0 || y < 0 || x > this.canvas.width || y > this.canvas.height) {
        this.spawn(p);
        continue;
      }
      if (!Number.isNaN(p.px) && Math.abs(x - p.px) < 40 && Math.abs(y - p.py) < 40) {
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(x, y);
      }
      p.px = x;
      p.py = y;
    }
    ctx.stroke();
  };
}

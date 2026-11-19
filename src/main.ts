import './styles.css';
import type { SatRec } from 'satellite.js';
import { CompareView } from './compare';
import { config } from './config';
import {
  extrapolate, issAt, issTrack, loadFires, loadFlights, loadIssOrbit, loadQuakes,
  type Fire, type Flight, type FlightSource, type IssState, type Quake, type QuakePeriod,
} from './data';
import { renderNight, sunAltitude } from './daynight';
import { loadEvents, type NaturalEvent } from './events';
import {
  LIGHTS_COMPOSITE, clampDay, cloudsRaster, datedRaster, radarRaster, shiftDay, utcDay,
  type DatedLayer, type RasterSpec,
} from './imagery';
import { DEFAULT_ON, GROUPS, LAYERS, layerDef, type Group, type LayerId } from './layers';
import { EarthMap, PALETTES, type DataLayer, type FC, type Pick, type Theme, type View } from './map';
import { aqiText, compass, loadPlace, weatherText, type PlaceInfo } from './place';
import { el, fmtInt, fmtIsoDay, fmtNum, relTime, store } from './util';
import { applyStatic, getLang, onLangChange, setLang, t } from './i18n';
import { TEMP_SCALE, WIND_SCALE, loadWeather, renderField, type WeatherGrid } from './weather';
import { WindParticles } from './wind';

// ---------- State ----------

type Selection =
  | { kind: 'flights'; id: string }
  | { kind: 'quakes'; id: string }
  | { kind: 'fires'; fire: Fire; lngLat: [number, number] }
  | { kind: 'volcanoes' | 'storms'; id: string }
  | { kind: 'iss' }
  | { kind: 'place'; lngLat: [number, number]; info: PlaceInfo | null; error: boolean }
  | null;

const DATA_LAYERS: DataLayer[] = ['flights', 'quakes', 'fires', 'iss', 'volcanoes', 'storms'];
const isDataLayer = (id: LayerId): id is DataLayer => (DATA_LAYERS as string[]).includes(id);

const savedLayers = store.get<Partial<Record<LayerId, boolean>>>('layers', {});
const state = {
  theme: document.documentElement.dataset.theme === 'light' ? 'light' : ('dark' as Theme),
  view: store.get<View>('view', 'globe'),
  layers: { ...DEFAULT_ON } as Record<LayerId, boolean>,
  group: store.get<Group>('group', 'move'),
  period: store.get<QuakePeriod>('period', 'day'),
  flightSource: (config.liveFlightsUrl ? store.get<FlightSource>('flightSource', 'snapshot') : 'snapshot') as FlightSource,
  dates: { lights: LIGHTS_COMPOSITE, satellite: utcDay(-1), aerosol: utcDay(-2) } as Record<DatedLayer, string>,
  compareDates: { lights: utcDay(-1), satellite: utcDay(-8), aerosol: utcDay(-9) } as Record<DatedLayer, string>,
  comparing: false,
  compareSynced: true,
  flights: [] as Flight[],
  flightsById: new Map<string, Flight>(),
  flightsT: 0,
  quakes: [] as Quake[],
  quakesById: new Map<string, Quake>(),
  quakesLoaded: false,
  fires: [] as Fire[],
  firesT: 0,
  events: [] as NaturalEvent[],
  eventsById: new Map<string, NaturalEvent>(),
  eventsLoaded: false,
  weather: null as WeatherGrid | null,
  fieldImages: {} as Partial<Record<'temp' | 'wind', string>>,
  radar: null as { spec: RasterSpec; time: number } | null,
  sat: null as SatRec | null,
  iss: null as IssState | null,
  selected: null as Selection,
  placeA: null as PlaceInfo | null,
  followIss: false,
  lastOk: 0,
  errors: new Set<string>(),
};

// Stored preferences come from the viewer's browser: only accept known values.
for (const l of LAYERS) if (typeof savedLayers[l.id] === 'boolean') state.layers[l.id] = savedLayers[l.id]!;
if (LAYERS.filter((l) => l.field && state.layers[l.id]).length > 1) {
  for (const l of LAYERS) if (l.field) state.layers[l.id] = false;
}
if (state.view !== 'globe' && state.view !== 'map') state.view = 'globe';
if (!GROUPS.some((g) => g.id === state.group)) state.group = 'move';
if (!['hour', 'day', 'week'].includes(state.period)) state.period = 'day';
if (state.flightSource !== 'live') state.flightSource = 'snapshot';

const activeField = (): LayerId | null => LAYERS.find((l) => l.field && state.layers[l.id])?.id ?? null;
const activeDated = (): DatedLayer | null => {
  const f = activeField();
  return f && layerDef(f).dated ? (f as DatedLayer) : null;
};

// On phones the layers panel is a bottom sheet; cards and the time bar sit above it.
const sheet = document.querySelector<HTMLElement>('.layers')!;
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--sheet-h', `${sheet.offsetHeight}px`);
}).observe(sheet);

// ---------- Map ----------

const earth = new EarthMap(document.getElementById('map')!, state.theme, state.view);
earth.map.once('load', () => document.getElementById('loader')?.remove());
for (const id of DATA_LAYERS) earth.setVisible(id, state.layers[id]);
earth.onPick(onPick);
earth.map.on('dragstart', () => setFollow(false));

const wind = new WindParticles(earth.map);
wind.setTheme(state.theme === 'dark');
let compare: CompareView | null = null;

const nowS = () => Date.now() / 1000;

function flightsFC(): FC {
  const t = nowS();
  return {
    type: 'FeatureCollection',
    features: state.flights.map((f) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: extrapolate(f, t) },
      properties: { id: f.id, heading: f.heading },
    })),
  };
}

function quakesFC(): FC {
  const now = Date.now();
  return {
    type: 'FeatureCollection',
    features: state.quakes.map((q) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [q.lng, q.lat] },
      properties: { id: q.id, mag: q.mag, ageH: (now - q.time) / 3_600_000 },
    })),
  };
}

function firesFC(): FC {
  return {
    type: 'FeatureCollection',
    features: state.fires.map((f) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
      properties: { frp: f.frp, conf: f.conf, time: f.time, count: f.count },
    })),
  };
}

function eventsFC(): FC {
  return {
    type: 'FeatureCollection',
    features: state.events.map((e) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
      properties: { id: e.id, kind: e.kind },
    })),
  };
}

function stormTracksFC(): FC {
  return {
    type: 'FeatureCollection',
    features: state.events
      .filter((e) => e.kind === 'storms' && e.track.length > 1)
      .map((e) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: e.track }, properties: { id: e.id } })),
  };
}

// ---------- Polling (paused while the tab is hidden) ----------

function poll(name: string, interval: () => number, task: () => Promise<void>, enabled: () => boolean = () => true): () => void {
  let timer = 0;
  let running = false;
  const run = async () => {
    window.clearTimeout(timer);
    if (document.hidden || running) return;
    if (!enabled()) {
      timer = window.setTimeout(run, interval());
      return;
    }
    running = true;
    try {
      await task();
      state.errors.delete(name);
      state.lastOk = Date.now();
    } catch (err) {
      console.warn(`[${name}]`, err);
      state.errors.add(name);
    } finally {
      running = false;
      renderLive();
      renderLayers();
      timer = window.setTimeout(run, interval());
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) run();
  });
  run();
  return run;
}

const refreshFlights = poll(
  'flights',
  () => (state.flightSource === 'live' ? config.refresh.flightsLive : config.refresh.flightsSnapshot),
  async () => {
    const { t, flights } = await loadFlights(state.flightSource);
    state.flights = flights;
    state.flightsT = t;
    state.flightsById = new Map(flights.map((f) => [f.id, f]));
    earth.setData('flights', flightsFC());
    refreshDetail();
  },
);

const refreshQuakes = poll('quakes', () => config.refresh.quakes, async () => {
  state.quakes = await loadQuakes(state.period);
  state.quakesById = new Map(state.quakes.map((q) => [q.id, q]));
  state.quakesLoaded = true;
  earth.setData('quakes', quakesFC());
  refreshDetail();
});

poll('fires', () => config.refresh.fires, async () => {
  const { t, fires } = await loadFires();
  state.fires = fires;
  state.firesT = t;
  earth.setData('fires', firesFC());
});

poll('iss', () => config.refresh.issTle, async () => {
  state.sat = await loadIssOrbit();
  tickIss(true);
});

poll('events', () => 15 * 60_000, async () => {
  state.events = await loadEvents();
  state.eventsById = new Map(state.events.map((e) => [e.id, e]));
  state.eventsLoaded = true;
  earth.setData('events', eventsFC());
  earth.setData('storm-tracks', stormTracksFC());
  refreshDetail();
});

poll(
  'weather',
  () => 30 * 60_000,
  async () => {
    const g = await loadWeather();
    if (state.weather?.runTime === g.runTime) return;
    state.weather = g;
    state.fieldImages = {};
    wind.setGrid(g);
    await applyOverlays();
  },
  () => state.layers.wind || state.layers.temp,
);

poll(
  'radar',
  () => 5 * 60_000,
  async () => {
    state.radar = await radarRaster();
    await applyOverlays();
  },
  () => state.layers.radar,
);

// Day/night shading follows the Sun: redraw every minute.
async function renderDayNight(): Promise<void> {
  if (!state.layers.daynight || document.hidden) return;
  earth.setImage('daynight', await renderNight(state.theme === 'dark'), 1);
}
window.setInterval(renderDayNight, 60_000);

// ISS moves every second; flights are nudged forward every 2 s.
let lastTrack = 0;
function tickIss(forceTrack = false): void {
  if (!state.sat || document.hidden) return;
  const now = new Date();
  state.iss = issAt(state.sat, now);
  if (!state.iss) return;
  earth.setData('iss', {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [state.iss.lng, state.iss.lat] }, properties: {} }],
  });
  if (forceTrack || now.getTime() - lastTrack > 60_000) {
    lastTrack = now.getTime();
    earth.setData('iss-track', {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: issTrack(state.sat, now) }, properties: {} }],
    });
  }
  if (state.followIss) earth.map.easeTo({ center: [state.iss.lng, state.iss.lat], duration: 900, easing: (t) => t });
  if (state.selected?.kind === 'iss') refreshDetail();
}
window.setInterval(() => tickIss(), 1000);
window.setInterval(() => {
  if (document.hidden || !state.layers.flights || !state.flights.length) return;
  earth.setData('flights', flightsFC());
  if (state.selected?.kind === 'flights') refreshDetail();
}, 2000);
window.setInterval(renderLive, 1000);

// ---------- Overlays (imagery, weather fields, night) ----------

let overlayToken = 0;
async function applyOverlays(): Promise<void> {
  const token = ++overlayToken;
  const L = state.layers;

  for (const id of ['lights', 'satellite', 'aerosol'] as DatedLayer[]) {
    earth.setRaster(id, L[id] ? datedRaster(id, state.dates[id]) : null);
  }
  earth.setRaster('clouds', L.clouds ? cloudsRaster(Math.floor(Date.now() / 3_600_000)) : null);
  earth.setRaster('radar', L.radar && state.radar ? state.radar.spec : null);

  // Weather fields are rendered in the browser from the GFS grid.
  for (const id of ['temp', 'wind'] as const) {
    if (L[id] && state.weather) {
      const url = state.fieldImages[id] ?? (state.fieldImages[id] = await renderField(state.weather, id));
      if (token !== overlayToken) return;
      earth.setImage(id, url, id === 'temp' ? 0.62 : 0.5);
    } else {
      earth.setImage(id, null);
    }
  }
  if (L.wind && state.weather) wind.start();
  else wind.stop();

  if (L.daynight) await renderDayNight();
  else earth.setImage('daynight', null);

  syncCompare();
  renderTimebar();
  renderLegend();
}

// ---------- Live pill ----------

const liveEl = document.getElementById('live')!;
const liveText = document.getElementById('live-text')!;

function renderLive(): void {
  if (!state.lastOk) {
    liveEl.dataset.state = state.errors.size ? 'error' : 'loading';
    liveText.textContent = state.errors.size ? t().live.offline : t().page.loading;
    return;
  }
  liveEl.dataset.state = state.errors.size >= 3 ? 'error' : 'ok';
  const s = Math.max(0, Math.round((Date.now() - state.lastOk) / 1000));
  liveText.textContent = s < 5 ? t().live.justNow : t().live.ago(s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);
}

// ---------- Layers panel (tabs per theme) ----------

const tabsEl = document.getElementById('group-tabs')!;
const layerList = document.getElementById('layer-list')!;
const groupExtra = document.getElementById('group-extra')!;
const tabBtns = new Map<Group, HTMLButtonElement>();
const layerRows = new Map<LayerId, { btn: HTMLButtonElement; sub: HTMLElement; dot: HTMLElement }>();
// Pollers that wait for their layer to be enabled can be started immediately.
const kickers: Record<string, () => void> = {};

const LAYER_COLOR: Record<LayerId, (t: Theme) => string> = {
  flights: (t) => PALETTES[t].flights,
  iss: (t) => PALETTES[t].iss,
  quakes: (t) => PALETTES[t].quakes,
  fires: (t) => PALETTES[t].fires,
  volcanoes: (t) => PALETTES[t].volcanoes,
  storms: (t) => PALETTES[t].storms,
  wind: () => '#38B3A4',
  temp: () => '#FFB44A',
  radar: () => '#4AA8F0',
  clouds: (t) => (t === 'dark' ? '#DADCE0' : '#8A8D94'),
  satellite: () => '#5C9E6B',
  aerosol: () => '#C9A227',
  lights: () => '#F5D76E',
  daynight: (t) => (t === 'dark' ? '#6F7FA8' : '#3E4B70'),
};

for (const g of GROUPS) {
  const icon = svg(g.icon);
  const badge = el('span', { class: 'tab-badge' });
  const b = el('button', { type: 'button', role: 'tab', class: 'tab', id: `tab-${g.id}` }, [icon, el('span', { class: 'tab-label' }), badge]);
  b.addEventListener('click', () => {
    state.group = g.id;
    store.set('group', g.id);
    renderLayers();
  });
  tabsEl.append(b);
  tabBtns.set(g.id, b);
}

for (const def of LAYERS) {
  const dot = el('span', { class: 'layer-dot' });
  const sub = el('span', { class: 'layer-sub' });
  const btn = el('button', { type: 'button', class: 'layer-row', 'aria-pressed': 'false' }, [
    el('span', { class: 'layer-swatch' }, [dot]),
    el('span', { class: 'layer-text' }, [el('span', { class: 'layer-name' }), sub]),
    el('span', { class: 'switch', 'aria-hidden': 'true' }, [el('span', { class: 'knob' })]),
  ]) as HTMLButtonElement;
  btn.addEventListener('click', () => toggleLayer(def.id));
  layerRows.set(def.id, { btn, sub, dot });
}

function toggleLayer(id: LayerId): void {
  const on = !state.layers[id];
  if (on && layerDef(id).field) {
    // Only one full-coverage background at a time.
    for (const l of LAYERS) if (l.field && l.id !== id) state.layers[l.id] = false;
  }
  state.layers[id] = on;
  store.set('layers', state.layers);
  if (isDataLayer(id)) {
    earth.setVisible(id, on);
    if (id === 'flights' && on) earth.setData('flights', flightsFC());
    if (!on && state.selected?.kind === id) select(null);
  }
  if (!activeDated()) state.comparing = false;
  renderLayers();
  void applyOverlays();
  if (on && (id === 'wind' || id === 'temp') && !state.weather) kick('weather');
  if (on && id === 'radar' && !state.radar) kick('radar');
}

function kick(name: string): void {
  kickers[name]?.();
}

function layerSub(id: LayerId): string {
  const T = t().sub;
  const loading = t().page.loading;
  if (state.errors.has(id === 'wind' || id === 'temp' ? 'weather' : id)) return T.unavailable;
  switch (id) {
    case 'flights':
      return state.flightsT
        ? T.flights(fmtInt(state.flights.length), state.flightSource === 'live' ? T.realtime : relTime(state.flightsT * 1000))
        : loading;
    case 'iss':
      return state.iss ? T.iss : loading;
    case 'quakes':
      return state.quakesLoaded ? `${fmtInt(state.quakes.length)} · ${T.period[state.period]}` : loading;
    case 'fires':
      return state.firesT ? T.fires(fmtInt(state.fires.length)) : loading;
    case 'volcanoes':
    case 'storms': {
      if (!state.eventsLoaded) return loading;
      const n = state.events.filter((e) => e.kind === id).length;
      return id === 'volcanoes' ? T.volcanoes(fmtInt(n)) : n ? T.storms(fmtInt(n)) : T.noStorms;
    }
    case 'wind':
    case 'temp':
      return state.weather
        ? T.gfsAt(new Date(state.weather.validTime).toLocaleTimeString(t().locale, { hour: '2-digit', minute: '2-digit' }))
        : state.layers[id] ? loading : T.gfs;
    case 'radar':
      return state.radar ? T.radarAt(relTime(state.radar.time)) : T.radar;
    case 'clouds':
      return T.clouds;
    case 'satellite':
      return state.layers.satellite ? T.satelliteOn(fmtDay(state.dates.satellite)) : T.satellite;
    case 'aerosol':
      return state.layers.aerosol ? T.aerosolOn(fmtDay(state.dates.aerosol)) : T.aerosol;
    case 'lights':
      return state.layers.lights
        ? state.dates.lights === LIGHTS_COMPOSITE ? T.lightsComposite : T.lightsNight(fmtDay(state.dates.lights))
        : T.lights;
    case 'daynight':
      return T.daynight;
  }
}

function renderLayers(): void {
  for (const g of GROUPS) {
    const b = tabBtns.get(g.id)!;
    const on = g.id === state.group;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    const n = LAYERS.filter((l) => l.group === g.id && state.layers[l.id]).length;
    (b.querySelector('.tab-badge') as HTMLElement).textContent = n ? String(n) : '';
    (b.querySelector('.tab-label') as HTMLElement).textContent = t().groups[g.id];
  }
  layerList.setAttribute('aria-labelledby', `tab-${state.group}`);
  const ids = LAYERS.filter((l) => l.group === state.group).map((l) => l.id);
  const rows = ids.map((id) => layerRows.get(id)!.btn);
  if (rows.some((r, i) => layerList.children[i] !== r) || layerList.children.length !== rows.length) {
    layerList.replaceChildren(...rows);
    renderGroupExtra();
  }
  for (const id of ids) {
    const row = layerRows.get(id)!;
    row.btn.setAttribute('aria-pressed', String(state.layers[id]));
    row.dot.style.background = LAYER_COLOR[id](state.theme);
    row.sub.textContent = layerSub(id);
    (row.btn.querySelector('.layer-name') as HTMLElement).textContent = t().layers[id];
  }
}

function segmented(label: string, options: { value: string; label: string }[], current: string, onPick: (v: string) => void): HTMLElement {
  const wrap = el('div', { class: 'segmented mini', role: 'group', 'aria-label': label });
  for (const o of options) {
    const b = el('button', { type: 'button', 'aria-pressed': String(o.value === current) }, [o.label]);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onPick(o.value);
    });
    wrap.append(b);
  }
  return wrap;
}

function renderGroupExtra(): void {
  const X = t().extra;
  groupExtra.replaceChildren();
  if (state.group === 'move' && config.liveFlightsUrl) {
    groupExtra.append(
      el('span', { class: 'muted small' }, [X.flights]),
      segmented(X.flightSource, [{ value: 'snapshot', label: X.every15 }, { value: 'live', label: X.realtime }], state.flightSource, (v) => {
        state.flightSource = v as FlightSource;
        store.set('flightSource', v);
        refreshFlights();
      }),
    );
  } else if (state.group === 'nature') {
    groupExtra.append(
      el('span', { class: 'muted small' }, [X.quakes]),
      segmented(X.quakePeriod, [{ value: 'hour', label: '1 h' }, { value: 'day', label: '24 h' }, { value: 'week', label: '7 d' }], state.period, (v) => {
        state.period = v as QuakePeriod;
        store.set('period', v);
        refreshQuakes();
      }),
    );
  } else if (state.group === 'climate' || state.group === 'night') {
    groupExtra.append(el('span', { class: 'muted small hint' }, [X.tapHint]));
  }
  groupExtra.hidden = !groupExtra.childElementCount;
}

renderLayers();
renderGroupExtra();

// ---------- Time bar (browse & compare dated imagery) ----------

const timebar = document.getElementById('timebar')!;
const dateInput = document.getElementById('date-input') as HTMLInputElement;

function fmtDay(day: string): string {
  return day === LIGHTS_COMPOSITE ? t().time.composite : fmtIsoDay(day);
}

function pickDate(layer: DatedLayer, current: string, onPick: (d: string) => void): void {
  dateInput.value = current === LIGHTS_COMPOSITE ? utcDay(-1) : current;
  dateInput.onchange = () => dateInput.value && onPick(clampDay(layer, dateInput.value));
  try {
    dateInput.showPicker();
  } catch {
    dateInput.focus();
  }
}

function dateControl(layer: DatedLayer, side: 'a' | 'b', label: string | null): HTMLElement {
  const dates = side === 'a' ? state.dates : state.compareDates;
  const set = (d: string) => {
    dates[layer] = d;
    void applyOverlays();
    renderLayers();
  };
  const cur = dates[layer];
  const step = (delta: number) => {
    if (cur === LIGHTS_COMPOSITE) return set(delta > 0 ? clampDay(layer, '2024-03-25') : cur);
    const next = shiftDay(cur, delta);
    if (layer === 'lights' && next < '2024-03-25' && delta < 0) return set(LIGHTS_COMPOSITE);
    set(clampDay(layer, next));
  };
  const prev = iconBtn('m15 6-6 6 6 6', t().time.prevDay, () => step(-1));
  const next = iconBtn('m9 6 6 6-6 6', t().time.nextDay, () => step(1));
  const day = el('button', { type: 'button', class: 'date-btn', 'aria-label': t().time.pickDate(fmtDay(cur)) }, [fmtDay(cur)]);
  day.addEventListener('click', () => pickDate(layer, cur, set));
  const kids: HTMLElement[] = [];
  if (label) kids.push(el('span', { class: 'side-label' }, [label]));
  kids.push(prev, day, next);
  return el('div', { class: 'date-ctl' }, kids);
}

function renderTimebar(): void {
  const layer = activeDated();
  timebar.hidden = !layer;
  document.body.classList.toggle('has-timebar', !!layer);
  if (!layer) return;
  const TT = t().time;
  const kids: HTMLElement[] = [];
  if (state.comparing) {
    kids.push(dateControl(layer, 'a', TT.left), el('span', { class: 'tb-sep' }), dateControl(layer, 'b', TT.right));
    const sync = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.compareSynced) }, [TT.sameplace]);
    sync.title = TT.sameplaceTitle;
    sync.addEventListener('click', () => {
      state.compareSynced = !state.compareSynced;
      compare?.setSynced(state.compareSynced);
      renderTimebar();
    });
    kids.push(sync, iconBtn('M6 6l12 12M18 6 6 18', TT.exitCompare, () => {
      state.comparing = false;
      syncCompare();
      renderTimebar();
    }));
  } else {
    kids.push(el('span', { class: 'tb-title' }, [t().layers[layer]]));
    if (layer === 'lights') {
      kids.push(
        segmented(TT.imageType, [{ value: 'composite', label: TT.composite }, { value: 'night', label: TT.nightly }],
          state.dates.lights === LIGHTS_COMPOSITE ? 'composite' : 'night', (v) => {
            state.dates.lights = v === 'composite' ? LIGHTS_COMPOSITE : utcDay(-1);
            void applyOverlays();
            renderLayers();
          }),
      );
    }
    if (!(layer === 'lights' && state.dates.lights === LIGHTS_COMPOSITE)) kids.push(dateControl(layer, 'a', null));
    const cmp = el('button', { type: 'button', class: 'chip' }, [svg('M12 3v18M4 7h5v10H4zM15 7h5v10h-5z'), TT.compare]);
    cmp.addEventListener('click', () => {
      state.comparing = true;
      state.compareSynced = true;
      syncCompare();
      renderTimebar();
    });
    kids.push(cmp);
  }
  timebar.replaceChildren(...kids);
}

function syncCompare(): void {
  const layer = activeDated();
  if (!state.comparing || !layer) {
    state.comparing = false;
    compare?.destroy();
    compare = null;
    document.body.classList.remove('comparing');
    return;
  }
  if (!compare) {
    compare = new CompareView(earth.map, state.theme, state.view);
    compare.setSynced(state.compareSynced);
  }
  compare.setRaster(datedRaster(layer, state.compareDates[layer]));
  document.body.classList.add('comparing');
}

// ---------- Legend ----------

const legend = document.getElementById('legend')!;

function gradient(stops: [number, string][]): string {
  const lo = stops[0][0];
  const hi = stops[stops.length - 1][0];
  return `linear-gradient(90deg, ${stops.map(([v, c]) => `${c} ${(((v - lo) / (hi - lo)) * 100).toFixed(1)}%`).join(', ')})`;
}

function renderLegend(): void {
  const f = activeField();
  let title = '';
  let bg = '';
  let ticks: string[] = [];
  if (f === 'temp') {
    title = t().legend.temp;
    bg = gradient(TEMP_SCALE);
    ticks = ['-40', '-20', '0', '20', '40'];
  } else if (f === 'wind') {
    title = t().legend.wind;
    bg = gradient(WIND_SCALE);
    ticks = ['0', '25', '50', '75', '100'];
  } else if (f === 'aerosol') {
    title = t().legend.aerosol;
    bg = 'linear-gradient(90deg, #FFFFB2, #FECC5C, #FD8D3C, #F03B20, #BD0026)';
    ticks = [t().legend.clean, '', '', '', t().legend.dense];
  }
  legend.hidden = !title;
  if (!title) return;
  legend.replaceChildren(
    el('span', { class: 'legend-title' }, [title]),
    el('span', { class: 'legend-bar', style: `background:${bg}` }),
    el('span', { class: 'legend-ticks' }, ticks.map((x) => el('span', {}, [x]))),
  );
}

// ---------- Top bar ----------

const viewBtns = document.querySelectorAll<HTMLButtonElement>('[data-view]');
function syncView(): void {
  viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
}
syncView();
viewBtns.forEach((b) =>
  b.addEventListener('click', () => {
    state.view = b.dataset.view as View;
    store.set('view', state.view);
    syncView();
    earth.setView(state.view);
    compare?.setView(state.view);
  }),
);

document.getElementById('theme-btn')!.addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  store.set('theme', state.theme);
  earth.setTheme(state.theme);
  compare?.setTheme(state.theme);
  wind.setTheme(state.theme === 'dark');
  renderLayers();
});
// ---------- Language ----------

applyStatic();
const langBtn = document.getElementById('lang-btn')!;
function syncLangBtn(): void {
  langBtn.textContent = getLang() === 'pt' ? 'EN' : 'PT';
}
syncLangBtn();
langBtn.addEventListener('click', () => setLang(getLang() === 'pt' ? 'en' : 'pt'));
onLangChange(() => {
  syncLangBtn();
  earth.setLanguage(getLang());
  compare?.setLanguage(getLang());
  renderLive();
  renderLayers();
  renderGroupExtra();
  renderTimebar();
  renderLegend();
  if (!searchBox.hidden) void searchPlaces();
  detailKey = '';
  refreshDetail();
});

// Overlays and night shading are re-applied every time the basemap style loads.
earth.onStyle(() => void applyOverlays());

document.getElementById('zoom-in')!.addEventListener('click', () => earth.map.zoomIn());
document.getElementById('zoom-out')!.addEventListener('click', () => earth.map.zoomOut());

// Data sources dialog
const sourcesEl = document.getElementById('sources')!;
document.querySelectorAll('[data-sources]').forEach((b) => b.addEventListener('click', () => (sourcesEl.hidden = !sourcesEl.hidden)));
document.querySelector('[data-sources-close]')!.addEventListener('click', () => (sourcesEl.hidden = true));

// ---------- Search (flights, ISS, places) ----------

const searchBtn = document.getElementById('search-btn')!;
const searchBox = document.getElementById('search')!;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchResults = document.getElementById('search-results')!;

function openSearch(open: boolean): void {
  searchBox.hidden = !open;
  searchBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    searchInput.value = '';
    renderSearch();
    searchInput.focus();
  }
}
searchBtn.addEventListener('click', () => openSearch(searchBox.hidden));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!searchBox.hidden) openSearch(false);
    else if (!sourcesEl.hidden) sourcesEl.hidden = true;
  }
  if (e.key === '/' && searchBox.hidden && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')) {
    e.preventDefault();
    openSearch(true);
  }
});
let searchTimer = 0;
let searchAbort: AbortController | null = null;
searchInput.addEventListener('input', () => {
  renderSearch();
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(searchPlaces, 300);
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') (searchResults.querySelector('button') as HTMLButtonElement | null)?.click();
});

interface SearchItem { label: string; sub: string; go: () => void }
let placeItems: SearchItem[] = [];

async function searchPlaces(): Promise<void> {
  const q = searchInput.value.trim();
  searchAbort?.abort();
  placeItems = [];
  if (q.length < 2) return renderSearch();
  searchAbort = new AbortController();
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=${getLang()}&format=json`,
      { signal: searchAbort.signal },
    );
    const j = (await res.json()) as { results?: { name: string; country?: string; admin1?: string; latitude: number; longitude: number }[] };
    placeItems = (j.results ?? []).map((r) => ({
      label: r.name,
      sub: [r.admin1, r.country].filter(Boolean).join(', '),
      go: () => {
        earth.map.flyTo({ center: [r.longitude, r.latitude], zoom: Math.max(earth.map.getZoom(), 7) });
        openPlace([r.longitude, r.latitude]);
      },
    }));
  } catch {
    /* aborted or offline */
  }
  renderSearch();
}

function renderSearch(): void {
  const raw = searchInput.value.trim();
  const q = raw.toUpperCase().replace(/\s+/g, '');
  searchResults.replaceChildren();
  if (!q) {
    searchResults.append(el('li', { class: 'muted small search-hint' }, [t().search.hint]));
    return;
  }
  const items: SearchItem[] = [];
  if ('ISS'.startsWith(q) && state.iss) items.push({ label: 'ISS', sub: t().search.issName, go: () => focusIss() });
  for (const f of state.flights) {
    if (items.length >= 5) break;
    if (f.callsign && f.callsign.toUpperCase().startsWith(q)) {
      items.push({
        label: f.callsign,
        sub: t().search.flight(f.country, fmtInt(f.altM)),
        go: () => {
          const [lng, lat] = extrapolate(f, nowS());
          earth.map.flyTo({ center: [lng, lat], zoom: Math.max(earth.map.getZoom(), 6) });
          select({ kind: 'flights', id: f.id });
        },
      });
    }
  }
  items.push(...placeItems);
  if (!items.length) {
    searchResults.append(el('li', { class: 'muted small search-hint' }, [t().search.searching]));
    return;
  }
  for (const it of items) {
    const b = el('button', { type: 'button', role: 'option' }, [
      el('span', { class: 'sr-label' }, [it.label]),
      el('span', { class: 'muted small' }, [it.sub]),
    ]);
    b.addEventListener('click', () => {
      openSearch(false);
      it.go();
    });
    searchResults.append(el('li', {}, [b]));
  }
}

// ---------- Selection & detail card ----------

const detail = document.getElementById('detail')!;
let detailKey = '';
let placeAbort: AbortController | null = null;

function onPick(p: Pick | null): void {
  if (!p) return select(null);
  if (p.kind === 'place') {
    // First click on empty map closes what is open; the next one inspects the place.
    if (state.selected && state.selected.kind !== 'place' && !state.placeA) return select(null);
    if (!searchBox.hidden) return openSearch(false);
    return openPlace(p.lngLat);
  }
  const props = p.feature.properties ?? {};
  if (p.kind === 'flights') select({ kind: 'flights', id: String(props.id) });
  else if (p.kind === 'quakes') select({ kind: 'quakes', id: String(props.id) });
  else if (p.kind === 'volcanoes' || p.kind === 'storms') select({ kind: p.kind, id: String(props.id) });
  else if (p.kind === 'iss') select({ kind: 'iss' });
  else {
    const g = p.feature.geometry as GeoJSON.Point;
    const [lng, lat] = g.coordinates as [number, number];
    select({
      kind: 'fires',
      lngLat: [lng, lat],
      fire: { lat, lng, frp: Number(props.frp), conf: Number(props.conf), time: Number(props.time), count: Number(props.count) },
    });
  }
}

function openPlace(lngLat: [number, number]): void {
  const sel: Selection = { kind: 'place', lngLat, info: null, error: false };
  select(sel);
  placeAbort?.abort();
  placeAbort = new AbortController();
  loadPlace(lngLat[1], lngLat[0], placeAbort.signal)
    .then((info) => {
      if (state.selected === sel) {
        sel.info = info;
        refreshDetail();
      }
    })
    .catch((err) => {
      if ((err as Error).name === 'AbortError') return;
      if (state.selected === sel) {
        sel.error = true;
        refreshDetail();
      }
    });
}

function select(sel: Selection): void {
  state.selected = sel;
  if (sel?.kind !== 'iss') setFollow(false);
  if (!sel) state.placeA = null;
  refreshDetail();
}

function setFollow(on: boolean): void {
  state.followIss = on;
  if (state.selected?.kind === 'iss') refreshDetail();
}

function focusIss(): void {
  if (!state.iss) return;
  earth.map.flyTo({ center: [state.iss.lng, state.iss.lat], zoom: Math.max(earth.map.getZoom(), 2.5) });
  select({ kind: 'iss' });
}

function selectedPoints(): [number, number][] {
  const s = state.selected;
  const pts: [number, number][] = [];
  if (state.placeA) pts.push([state.placeA.lng, state.placeA.lat]);
  if (!s) return pts;
  if (s.kind === 'flights') {
    const f = state.flightsById.get(s.id);
    if (f) pts.push(extrapolate(f, nowS()));
  } else if (s.kind === 'quakes') {
    const q = state.quakesById.get(s.id);
    if (q) pts.push([q.lng, q.lat]);
  } else if (s.kind === 'volcanoes' || s.kind === 'storms') {
    const e = state.eventsById.get(s.id);
    if (e) pts.push([e.lng, e.lat]);
  } else if (s.kind === 'fires' || s.kind === 'place') {
    pts.push(s.lngLat);
  }
  return pts;
}

function tile(label: string, value: string): HTMLElement {
  return el('div', { class: 'tile' }, [el('span', { class: 'muted small' }, [label]), el('span', { class: 'tile-v' }, [value])]);
}

function card(kicker: string, title: string, sub: string | null, body: HTMLElement[], actions: HTMLElement[] = []): HTMLElement[] {
  const close = el('button', { type: 'button', class: 'close', 'aria-label': t().card.close }, [svg('M6 6l12 12M18 6 6 18')]);
  close.addEventListener('click', () => select(null));
  return [
    el('div', { class: 'detail-head' }, [
      el('div', { class: 'detail-titles' }, [
        el('span', { class: 'kicker' }, [kicker]),
        el('span', { class: 'detail-title' }, [title]),
        ...(sub ? [el('span', { class: 'muted' }, [sub])] : []),
      ]),
      close,
    ]),
    ...body,
    ...(actions.length ? [el('div', { class: 'detail-actions' }, actions)] : []),
  ];
}

const tiles = (items: HTMLElement[]) => el('div', { class: 'tiles' }, items);

function button(label: string, primary: boolean, onClick: () => void): HTMLElement {
  const b = el('button', { type: 'button', class: primary ? 'btn btn-primary' : 'btn' }, [label]);
  b.addEventListener('click', onClick);
  return b;
}

function link(label: string, href: string): HTMLElement {
  return el('a', { class: 'btn btn-primary', href, target: '_blank', rel: 'noopener' }, [label]);
}

const fmtLat = (v: number) => `${fmtNum(Math.abs(v), 2)}° ${v >= 0 ? 'N' : 'S'}`;
const fmtLng = (v: number) => `${fmtNum(Math.abs(v), 2)}° ${v >= 0 ? t().east : t().west}`;

function localTime(p: PlaceInfo): string {
  const d = new Date(Date.now() + p.utcOffsetS * 1000);
  return d.toISOString().slice(11, 16);
}

function placeRows(p: PlaceInfo): [string, string][] {
  const sun = sunAltitude(p.lat, p.lng);
  const C = t().card;
  const r = C.rows;
  return [
    [r.localTime, `${localTime(p)} · ${sun > 0 ? C.day : sun > -6 ? C.twilight : C.night}`],
    [r.weather, weatherText(p.code)],
    [r.temp, `${fmtNum(p.temp, 1)} °C`],
    [r.feels, `${fmtNum(p.feels, 1)} °C`],
    [r.wind, `${fmtInt(p.windKmh)} km/h ${compass(p.windDir)}`],
    [r.humidity, `${fmtInt(p.humidity)} %`],
    [r.clouds, `${fmtInt(p.cloud)} %`],
    [r.precip, `${fmtNum(p.precip, 1)} mm`],
    [r.air, p.aqi != null ? `${aqiText(p.aqi)} (${fmtInt(p.aqi)})` : '—'],
    [r.pm25, p.pm25 != null ? `${fmtNum(p.pm25, 1)} µg/m³` : '—'],
    [r.sun, sun >= 0 ? C.sunAbove(fmtInt(sun)) : C.sunBelow(fmtInt(-sun))],
  ];
}

function placeCard(s: Extract<Selection, { kind: 'place' }>): HTMLElement[] {
  const [lng, lat] = s.lngLat;
  const coords = `${fmtLat(lat)} · ${fmtLng(lng)}`;
  const C = t().card;
  if (s.error) return card(C.place, coords, null, [el('p', { class: 'muted' }, [C.placeError])]);
  if (!s.info) return card(C.place, coords, null, [el('p', { class: 'muted' }, [C.placeLoading])]);
  const p = s.info;
  const a = state.placeA;

  if (a && (a.lat !== p.lat || a.lng !== p.lng)) {
    // Side-by-side comparison of two places.
    const ra = placeRows(a);
    const rb = placeRows(p);
    const head = el('div', { class: 'cmp-row cmp-head' }, [
      el('span', {}, ['']),
      el('span', {}, [`A · ${fmtLat(a.lat)}`]),
      el('span', {}, [`B · ${fmtLat(p.lat)}`]),
    ]);
    const rows = ra.map(([label, va], i) =>
      el('div', { class: 'cmp-row' }, [el('span', { class: 'muted small' }, [label]), el('span', {}, [va]), el('span', {}, [rb[i][1]])]),
    );
    return card(C.compareKicker, C.compareTitle, C.compareSub, [el('div', { class: 'cmp-table' }, [head, ...rows])], [
      button(C.newCompare, false, () => {
        state.placeA = p;
        refreshDetail();
      }),
      button(C.finish, true, () => {
        state.placeA = null;
        refreshDetail();
      }),
    ]);
  }

  const rows = placeRows(p);
  return card(
    C.place,
    coords,
    `${weatherText(p.code)} · ${C.localTime(localTime(p))}`,
    [tiles(rows.slice(2).map(([l, v]) => tile(l, v)))],
    a
      ? [el('p', { class: 'muted small cmp-hint' }, [C.compareHint])]
      : [button(C.compareWith, true, () => {
          state.placeA = p;
          refreshDetail();
        })],
  );
}

function refreshDetail(): void {
  const s = state.selected;
  earth.setData('selected', {
    type: 'FeatureCollection',
    features: selectedPoints().map((c) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} })),
  });

  const C = t().card;
  let content: HTMLElement[] | null = null;
  if (s?.kind === 'flights') {
    const f = state.flightsById.get(s.id);
    if (f) {
      const [lng, lat] = extrapolate(f, nowS());
      content = card(C.flight, f.callsign || f.id.toUpperCase(), f.country || null, [
        tiles([
          tile(C.altitude, `${fmtInt(f.altM)} m`),
          tile(C.speed, `${fmtInt(f.speedMs * 3.6)} km/h`),
          tile(C.heading, `${fmtInt(f.heading)}°`),
          tile(C.vertical, `${f.vRate > 0 ? '+' : ''}${fmtNum(f.vRate, 1)} m/s`),
          tile(C.position, `${fmtNum(lat, 2)}°, ${fmtNum(lng, 2)}°`),
          tile(C.data, state.flightSource === 'live' ? C.realtime : relTime(f.t * 1000)),
        ]),
      ], [button(C.center, true, () => earth.map.flyTo({ center: extrapolate(f, nowS()), zoom: Math.max(earth.map.getZoom(), 6) }))]);
    }
  } else if (s?.kind === 'quakes') {
    const q = state.quakesById.get(s.id);
    if (q) {
      content = card(C.quake, `M ${fmtNum(q.mag, 1)}`, q.place || null, [
        tiles([
          tile(C.depth, `${fmtNum(q.depth, 1)} km`),
          tile(C.when, relTime(q.time)),
          tile(C.tsunami, q.tsunami ? C.tsunamiYes : C.tsunamiNo),
          tile(C.source, 'USGS'),
        ]),
      ], /^https:\/\/earthquake\.usgs\.gov\//.test(q.url) ? [link(C.openUsgs, q.url)] : []);
    }
  } else if (s?.kind === 'fires') {
    const f = s.fire;
    content = card(C.fire, C.fireZone, `${fmtLat(f.lat)} · ${fmtLng(f.lng)}`, [
      tiles([
        tile(C.power, `${fmtNum(f.frp, 1)} MW`),
        tile(C.confidence, C.confLevels[f.conf] ?? '—'),
        tile(C.detected, f.time ? relTime(f.time * 1000) : '—'),
        tile(C.detections, fmtInt(f.count)),
      ]),
    ]);
  } else if (s?.kind === 'volcanoes' || s?.kind === 'storms') {
    const e = state.eventsById.get(s.id);
    if (e) {
      const items = s.kind === 'volcanoes'
        ? [
            tile(C.activeSince, fmtIsoDay(new Date(e.firstTime).toISOString().slice(0, 10))),
            tile(C.status, C.ongoing),
            tile(C.position, `${fmtLat(e.lat)}, ${fmtLng(e.lng)}`),
            tile(C.source, 'NASA EONET'),
          ]
        : [
            tile(C.maxWind, e.windKts != null ? `${fmtInt(e.windKts * 1.852)} km/h` : '—'),
            tile(C.lastPosition, relTime(e.time)),
            tile(C.since, relTime(e.firstTime)),
            tile(C.trackPoints, fmtInt(e.track.length)),
          ];
      content = card(s.kind === 'volcanoes' ? C.volcano : C.storm, e.title, null, [tiles(items)], e.sourceUrl ? [link(C.viewSource, e.sourceUrl)] : []);
    }
  } else if (s?.kind === 'iss' && state.iss) {
    const i = state.iss;
    content = card(C.station, 'ISS', null, [
      tiles([
        tile(C.latitude, fmtLat(i.lat)),
        tile(C.longitude, fmtLng(i.lng)),
        tile(C.altitude, `${fmtInt(i.altKm)} km`),
        tile(C.speed, `${fmtInt(i.speedKmh)} km/h`),
      ]),
    ], [
      button(state.followIss ? C.following : C.follow, true, () => {
        setFollow(!state.followIss);
        if (state.followIss) focusIss();
      }),
    ]);
  } else if (s?.kind === 'place') {
    content = placeCard(s);
  }

  if (!content) {
    detail.hidden = true;
    detail.replaceChildren();
    detailKey = '';
    if (s && s.kind !== 'iss') state.selected = null;
    return;
  }
  // Same item as before (periodic refresh): update values in place so focus and
  // hover states on the buttons are not lost every second.
  const key = s
    ? `${s.kind}:${'id' in s ? s.id : 'lngLat' in s ? s.lngLat.join() : ''}:${s.kind === 'place' ? `${!!s.info}${s.error}${!!state.placeA}` : ''}`
    : '';
  if (key === detailKey && !detail.hidden) {
    const fresh = el('div', {}, content);
    const oldV = detail.querySelectorAll('.tile-v, .btn');
    const newV = fresh.querySelectorAll('.tile-v, .btn');
    if (oldV.length === newV.length) {
      oldV.forEach((n, i) => {
        if (n.textContent !== newV[i].textContent) n.textContent = newV[i].textContent;
      });
      return;
    }
  }
  detailKey = key;
  detail.replaceChildren(...content);
  detail.hidden = false;
}

// ---------- Helpers ----------

function svg(d: string): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', d);
  s.append(p);
  return s;
}

function iconBtn(d: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', class: 'icon-mini', 'aria-label': label }, [svg(d)]) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

// Keep a reference so layer toggles can start lazily-enabled pollers at once.
kickers.weather = () => void loadWeather()
  .then(async (g) => {
    state.weather = g;
    state.fieldImages = {};
    wind.setGrid(g);
    await applyOverlays();
    renderLayers();
  })
  .catch(() => state.errors.add('weather'));
kickers.radar = () => void radarRaster()
  .then(async (r) => {
    state.radar = r;
    await applyOverlays();
    renderLayers();
  })
  .catch(() => state.errors.add('radar'));


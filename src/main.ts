import './styles.css';
import type { SatRec } from 'satellite.js';
import { config } from './config';
import {
  extrapolate, issAt, issTrack, loadFires, loadFlights, loadIssOrbit, loadQuakes,
  type Fire, type Flight, type FlightSource, type IssState, type Quake, type QuakePeriod,
} from './data';
import { EarthMap, PALETTES, type FC, type LayerId, type Pick, type Theme, type View } from './map';
import { el, fmtInt, fmtNum, relTime, store } from './util';

// ---------- State ----------

type Selection =
  | { kind: 'flights'; id: string }
  | { kind: 'quakes'; id: string }
  | { kind: 'fires'; fire: Fire; lngLat: [number, number] }
  | { kind: 'iss' }
  | null;

const state = {
  theme: document.documentElement.dataset.theme === 'light' ? 'light' : ('dark' as Theme),
  view: store.get<View>('view', 'globe'),
  layers: store.get<Record<LayerId, boolean>>('layers', { flights: true, quakes: true, fires: true, iss: true }),
  period: store.get<QuakePeriod>('period', 'day'),
  flightSource: (config.liveFlightsUrl ? store.get<FlightSource>('flightSource', 'snapshot') : 'snapshot') as FlightSource,
  flights: [] as Flight[],
  flightsById: new Map<string, Flight>(),
  flightsT: 0,
  quakes: [] as Quake[],
  quakesById: new Map<string, Quake>(),
  quakesLoaded: false,
  fires: [] as Fire[],
  firesT: 0,
  sat: null as SatRec | null,
  iss: null as IssState | null,
  selected: null as Selection,
  followIss: false,
  lastOk: 0,
  errors: new Set<string>(),
};

// Stored preferences come from the viewer's browser: only accept known values.
if (state.view !== 'globe' && state.view !== 'map') state.view = 'globe';
if (!['hour', 'day', 'week'].includes(state.period)) state.period = 'day';
if (state.flightSource !== 'live') state.flightSource = 'snapshot';

// On phones the layers panel is a bottom sheet; the detail card sits above it.
const sheet = document.querySelector<HTMLElement>('.layers')!;
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--sheet-h', `${sheet.offsetHeight}px`);
}).observe(sheet);

// ---------- Map ----------

const earth = new EarthMap(document.getElementById('map')!, state.theme, state.view);
earth.map.once('load', () => document.getElementById('loader')?.remove());
for (const k of Object.keys(state.layers) as LayerId[]) earth.setVisible(k, state.layers[k]);
earth.onPick(onPick);
earth.map.on('dragstart', () => setFollow(false));

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

// ---------- Polling (paused while the tab is hidden) ----------

function poll(name: string, interval: () => number, task: () => Promise<void>): () => void {
  let timer = 0;
  let running = false;
  const run = async () => {
    window.clearTimeout(timer);
    if (document.hidden) return;
    if (running) return;
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
    renderLayers();
    refreshDetail();
  },
);

const refreshQuakes = poll('quakes', () => config.refresh.quakes, async () => {
  state.quakes = await loadQuakes(state.period);
  state.quakesById = new Map(state.quakes.map((q) => [q.id, q]));
  state.quakesLoaded = true;
  earth.setData('quakes', quakesFC());
  renderLayers();
  refreshDetail();
});

poll('fires', () => config.refresh.fires, async () => {
  const { t, fires } = await loadFires();
  state.fires = fires;
  state.firesT = t;
  earth.setData('fires', firesFC());
  renderLayers();
});

poll('iss', () => config.refresh.issTle, async () => {
  state.sat = await loadIssOrbit();
  tickIss(true);
  renderLayers();
});

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

// ---------- Live pill ----------

const liveEl = document.getElementById('live')!;
const liveText = document.getElementById('live-text')!;

function renderLive(): void {
  if (!state.lastOk) {
    liveEl.dataset.state = state.errors.size ? 'error' : 'loading';
    liveText.textContent = state.errors.size ? 'Sem ligação' : 'A carregar…';
    return;
  }
  liveEl.dataset.state = state.errors.size >= 3 ? 'error' : 'ok';
  const s = Math.max(0, Math.round((Date.now() - state.lastOk) / 1000));
  liveText.textContent = s < 5 ? 'Atualizado agora' : `Atualizado há ${s < 60 ? `${s} s` : `${Math.round(s / 60)} min`}`;
}

// ---------- Layers panel ----------

const LAYER_META: { id: LayerId; name: string }[] = [
  { id: 'flights', name: 'Voos' },
  { id: 'quakes', name: 'Sismos' },
  { id: 'fires', name: 'Incêndios' },
  { id: 'iss', name: 'ISS' },
];
const layerList = document.getElementById('layer-list')!;
const layerRows = new Map<LayerId, { btn: HTMLButtonElement; sub: HTMLElement; dot: HTMLElement }>();

for (const m of LAYER_META) {
  const dot = el('span', { class: 'layer-dot' });
  const sub = el('span', { class: 'layer-sub' });
  const btn = el('button', { type: 'button', class: 'layer-row', 'aria-pressed': String(state.layers[m.id]) }, [
    el('span', { class: 'layer-swatch' }, [dot]),
    el('span', { class: 'layer-text' }, [el('span', { class: 'layer-name' }, [m.name]), sub]),
    el('span', { class: 'switch', 'aria-hidden': 'true' }, [el('span', { class: 'knob' })]),
  ]) as HTMLButtonElement;
  btn.addEventListener('click', () => {
    state.layers[m.id] = !state.layers[m.id];
    store.set('layers', state.layers);
    earth.setVisible(m.id, state.layers[m.id]);
    if (m.id === 'flights' && state.layers.flights) earth.setData('flights', flightsFC());
    if (!state.layers[m.id] && state.selected?.kind === m.id) select(null);
    renderLayers();
  });
  layerList.append(btn);
  layerRows.set(m.id, { btn, sub, dot });
}

const PERIOD_LABEL: Record<QuakePeriod, string> = { hour: 'última hora', day: 'últimas 24 h', week: 'últimos 7 dias' };

function renderLayers(): void {
  const p = PALETTES[state.theme];
  for (const m of LAYER_META) {
    const row = layerRows.get(m.id)!;
    row.btn.setAttribute('aria-pressed', String(state.layers[m.id]));
    row.dot.style.background = p[m.id];
    let sub = 'A carregar…';
    if (m.id === 'flights' && state.flightsT) {
      sub = `${fmtInt(state.flights.length)} no ar · ${state.flightSource === 'live' ? 'tempo real' : relTime(state.flightsT * 1000)}`;
    } else if (m.id === 'quakes' && state.quakesLoaded) {
      sub = `${fmtInt(state.quakes.length)} · ${PERIOD_LABEL[state.period]}`;
    } else if (m.id === 'fires' && state.firesT) {
      sub = `${fmtInt(state.fires.length)} zonas ativas · 24 h`;
    } else if (m.id === 'iss' && state.iss) {
      sub = 'Órbita em tempo real';
    }
    if (state.errors.has(m.id)) sub = 'Indisponível de momento';
    row.sub.textContent = sub;
  }
}
renderLayers();

// Flight source (only when a live Worker URL is configured)
const sourceSwitch = document.getElementById('source-switch')!;
if (config.liveFlightsUrl) {
  sourceSwitch.hidden = false;
  const btns = sourceSwitch.querySelectorAll<HTMLButtonElement>('button[data-source]');
  const sync = () => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.source === state.flightSource)));
  sync();
  btns.forEach((b) =>
    b.addEventListener('click', () => {
      state.flightSource = b.dataset.source as FlightSource;
      store.set('flightSource', state.flightSource);
      sync();
      refreshFlights();
    }),
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
  }),
);

document.getElementById('theme-btn')!.addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  store.set('theme', state.theme);
  earth.setTheme(state.theme);
  renderLayers();
});

const periodBtns = document.querySelectorAll<HTMLButtonElement>('[data-period]');
const syncPeriod = () => periodBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.period === state.period)));
syncPeriod();
periodBtns.forEach((b) =>
  b.addEventListener('click', () => {
    state.period = b.dataset.period as QuakePeriod;
    store.set('period', state.period);
    syncPeriod();
    refreshQuakes();
  }),
);

document.getElementById('zoom-in')!.addEventListener('click', () => earth.map.zoomIn());
document.getElementById('zoom-out')!.addEventListener('click', () => earth.map.zoomOut());

// ---------- Search ----------

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
  if (e.key === 'Escape' && !searchBox.hidden) openSearch(false);
  if (e.key === '/' && searchBox.hidden && document.activeElement?.tagName !== 'INPUT') {
    e.preventDefault();
    openSearch(true);
  }
});
searchInput.addEventListener('input', renderSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') (searchResults.querySelector('button') as HTMLButtonElement | null)?.click();
});

function renderSearch(): void {
  const q = searchInput.value.toUpperCase().replace(/\s+/g, '');
  searchResults.replaceChildren();
  if (!q) {
    searchResults.append(el('li', { class: 'muted small search-hint' }, ['Escreve um indicativo de voo ou “ISS”.']));
    return;
  }
  const items: { label: string; sub: string; go: () => void }[] = [];
  if ('ISS'.startsWith(q) && state.iss) {
    items.push({ label: 'ISS', sub: 'Estação Espacial Internacional', go: () => focusIss() });
  }
  for (const f of state.flights) {
    if (items.length >= 8) break;
    if (f.callsign && f.callsign.toUpperCase().startsWith(q)) {
      items.push({
        label: f.callsign,
        sub: `${f.country} · ${fmtInt(f.altM)} m`,
        go: () => {
          const [lng, lat] = extrapolate(f, nowS());
          earth.map.flyTo({ center: [lng, lat], zoom: Math.max(earth.map.getZoom(), 6) });
          select({ kind: 'flights', id: f.id });
        },
      });
    }
  }
  if (!items.length) {
    searchResults.append(el('li', { class: 'muted small search-hint' }, ['Sem resultados.']));
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

function onPick(p: Pick | null): void {
  if (!p) return select(null);
  const props = p.feature.properties ?? {};
  if (p.kind === 'flights') select({ kind: 'flights', id: String(props.id) });
  else if (p.kind === 'quakes') select({ kind: 'quakes', id: String(props.id) });
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

function select(sel: Selection): void {
  state.selected = sel;
  if (sel?.kind !== 'iss') setFollow(false);
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

function selectedPoint(): [number, number] | null {
  const s = state.selected;
  if (!s) return null;
  if (s.kind === 'flights') {
    const f = state.flightsById.get(s.id);
    return f ? extrapolate(f, nowS()) : null;
  }
  if (s.kind === 'quakes') {
    const q = state.quakesById.get(s.id);
    return q ? [q.lng, q.lat] : null;
  }
  if (s.kind === 'fires') return s.lngLat;
  return null; // ISS already has its own halo
}

function tile(label: string, value: string): HTMLElement {
  return el('div', { class: 'tile' }, [el('span', { class: 'muted small' }, [label]), el('span', { class: 'tile-v' }, [value])]);
}

function card(kicker: string, title: string, sub: string | null, tiles: HTMLElement[], actions: HTMLElement[] = []): HTMLElement[] {
  const close = el('button', { type: 'button', class: 'close', 'aria-label': 'Fechar' }, [
    svg('M6 6l12 12M18 6 6 18'),
  ]);
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
    el('div', { class: 'tiles' }, tiles),
    ...(actions.length ? [el('div', { class: 'detail-actions' }, actions)] : []),
  ];
}

function button(label: string, primary: boolean, onClick: () => void): HTMLElement {
  const b = el('button', { type: 'button', class: primary ? 'btn btn-primary' : 'btn' }, [label]);
  b.addEventListener('click', onClick);
  return b;
}

function refreshDetail(): void {
  const s = state.selected;
  const pt = selectedPoint();
  earth.setData('selected', {
    type: 'FeatureCollection',
    features: pt ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: pt }, properties: {} }] : [],
  });

  let content: HTMLElement[] | null = null;
  if (s?.kind === 'flights') {
    const f = state.flightsById.get(s.id);
    if (f) {
      const [lng, lat] = extrapolate(f, nowS());
      content = card(
        'Voo',
        f.callsign || f.id.toUpperCase(),
        f.country || null,
        [
          tile('Altitude', `${fmtInt(f.altM)} m`),
          tile('Velocidade', `${fmtInt(f.speedMs * 3.6)} km/h`),
          tile('Rumo', `${fmtInt(f.heading)}°`),
          tile('Vertical', `${f.vRate > 0 ? '+' : ''}${fmtNum(f.vRate, 1)} m/s`),
          tile('Posição', `${fmtNum(lat, 2)}°, ${fmtNum(lng, 2)}°`),
          tile('Dados', state.flightSource === 'live' ? 'tempo real' : relTime(f.t * 1000)),
        ],
        [button('Centrar', true, () => earth.map.flyTo({ center: extrapolate(f, nowS()), zoom: Math.max(earth.map.getZoom(), 6) }))],
      );
    }
  } else if (s?.kind === 'quakes') {
    const q = state.quakesById.get(s.id);
    if (q) {
      const actions: HTMLElement[] = [];
      if (/^https:\/\/earthquake\.usgs\.gov\//.test(q.url)) {
        actions.push(el('a', { class: 'btn btn-primary', href: q.url, target: '_blank', rel: 'noopener' }, ['Abrir no USGS']));
      }
      content = card(
        'Sismo',
        `M ${fmtNum(q.mag, 1)}`,
        q.place || null,
        [
          tile('Profundidade', `${fmtNum(q.depth, 1)} km`),
          tile('Quando', relTime(q.time)),
          tile('Tsunami', q.tsunami ? 'Alerta emitido' : 'Sem alerta'),
          tile('Fonte', 'USGS'),
        ],
        actions,
      );
    }
  } else if (s?.kind === 'fires') {
    const f = s.fire;
    content = card(
      'Incêndio',
      'Zona ativa (~5 km)',
      `${fmtNum(f.lat, 3)}°, ${fmtNum(f.lng, 3)}°`,
      [
        tile('Potência', `${fmtNum(f.frp, 1)} MW`),
        tile('Confiança', ['Baixa', 'Normal', 'Alta'][f.conf] ?? '—'),
        tile('Detetado', f.time ? relTime(f.time * 1000) : '—'),
        tile('Deteções', fmtInt(f.count)),
      ],
    );
  } else if (s?.kind === 'iss' && state.iss) {
    const i = state.iss;
    content = card(
      'Estação espacial',
      'ISS',
      null,
      [
        tile('Latitude', `${fmtNum(Math.abs(i.lat), 2)}° ${i.lat >= 0 ? 'N' : 'S'}`),
        tile('Longitude', `${fmtNum(Math.abs(i.lng), 2)}° ${i.lng >= 0 ? 'E' : 'W'}`),
        tile('Altitude', `${fmtInt(i.altKm)} km`),
        tile('Velocidade', `${fmtInt(i.speedKmh)} km/h`),
      ],
      [
        button(state.followIss ? 'A seguir' : 'Seguir', true, () => {
          setFollow(!state.followIss);
          if (state.followIss) focusIss();
        }),
      ],
    );
  }

  if (!content) {
    detail.hidden = true;
    detail.replaceChildren();
    document.body.classList.remove('has-detail');
    if (s && s.kind !== 'iss') state.selected = null;
    return;
  }
  // Same item as before (periodic refresh): update values in place so focus and
  // hover states on the buttons are not lost every second.
  const key = s ? `${s.kind}:${'id' in s ? s.id : s.kind === 'fires' ? s.lngLat.join() : ''}` : '';
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
  document.body.classList.add('has-detail');
}

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

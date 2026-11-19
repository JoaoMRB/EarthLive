/**
 * Portuguese / English strings. Portuguese is the reference; English must have
 * exactly the same keys (enforced by the type).
 */
import type { Group, LayerId } from './layers';

export type Lang = 'pt' | 'en';

const pt = {
  locale: 'pt-PT',
  months: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  compass: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
  east: 'E',
  west: 'O',
  now: 'agora',

  // Static page (data-i18n keys)
  page: {
    description: 'Voos, sismos, incêndios, vento, nuvens, luzes noturnas e a ISS em tempo real, num globo 3D ou num mapa.',
    mapRegion: 'Mapa interativo',
    view: 'Vista',
    globe: 'Globo',
    map: 'Mapa',
    search: 'Pesquisar',
    theme: 'Mudar tema',
    language: 'Change language to English',
    searchLabel: 'Pesquisar voo, lugar ou ISS',
    searchPlaceholder: 'Voo (ex. TAP1234), lugar ou ISS',
    results: 'Resultados',
    layers: 'Camadas',
    themes: 'Temas',
    github: 'Código no GitHub',
    sources: 'Fontes dos dados',
    detail: 'Detalhe',
    credits: 'Créditos',
    close: 'Fechar',
    zoomIn: 'Aproximar',
    zoomOut: 'Afastar',
    loading: 'A carregar…',
    srcFlights: 'Voos',
    srcQuakes: 'Sismos',
    srcFires: 'Incêndios',
    srcEvents: 'Vulcões e tempestades',
    srcIss: 'ISS',
    srcWeather: 'Vento e temperatura',
    srcClouds: 'Nuvens',
    srcRadar: 'Radar de chuva',
    srcImagery: 'Satélite, luzes, poluição',
    srcPoint: 'Tempo e ar num local',
    srcBasemap: 'Mapa base',
    srcAurora: 'Auroras',
    install: 'Instalar app',
  },

  pwa: {
    iosHint: 'Para instalar: toca em Partilhar (□↑) e depois em “Adicionar ao ecrã principal”.',
  },

  groups: { move: 'Movimento', nature: 'Natureza', climate: 'Clima', night: 'Noite' } as Record<Group, string>,
  layers: {
    flights: 'Voos', iss: 'ISS', quakes: 'Sismos', fires: 'Incêndios', volcanoes: 'Vulcões', storms: 'Tempestades',
    wind: 'Vento', temp: 'Temperatura', radar: 'Chuva (radar)', clouds: 'Nuvens', satellite: 'Satélite',
    aerosol: 'Poluição e fumo', lights: 'Luzes noturnas', aurora: 'Auroras', daynight: 'Dia e noite',
  } as Record<LayerId, string>,

  live: {
    offline: 'Sem ligação',
    justNow: 'Atualizado agora',
    ago: (t: string) => `Atualizado há ${t}`,
  },

  sub: {
    unavailable: 'Indisponível de momento',
    flights: (n: string, when: string) => `${n} no ar · ${when}`,
    realtime: 'tempo real',
    iss: 'Órbita em tempo real',
    period: { hour: 'última hora', day: 'últimas 24 h', week: 'últimos 7 dias' },
    fires: (n: string) => `${n} zonas ativas · 24 h`,
    volcanoes: (n: string) => `${n} com atividade em curso`,
    storms: (n: string) => `${n} ativas agora`,
    noStorms: 'Nenhuma ativa agora',
    gfsAt: (time: string) => `Previsão GFS para as ${time}`,
    gfs: 'Modelo global NOAA GFS',
    radarAt: (when: string) => `Radar · ${when}`,
    radar: 'Radares meteorológicos',
    clouds: 'Satélites geostacionários · EUMETSAT',
    satelliteOn: (d: string) => `Cores reais · ${d}`,
    satellite: 'Imagem real do dia (NASA)',
    aerosolOn: (d: string) => `Aerossóis · ${d}`,
    aerosol: 'Fumo, poeira e poluição',
    lightsComposite: 'Composição sem nuvens · 2016',
    lightsNight: (d: string) => `Noite de ${d}`,
    lights: 'Cidades vistas de noite (NASA)',
    daynight: 'Sol e crepúsculo agora',
    aurora: 'Previsão NOAA para a próxima hora',
    auroraOn: (kp: string, max: string) => `Kp ${kp} agora · máx. ${max} nas próximas 24 h`,
  },

  extra: {
    flights: 'Voos',
    flightSource: 'Fonte dos voos',
    every15: 'A cada 15 min',
    realtime: 'Tempo real',
    quakes: 'Sismos',
    quakePeriod: 'Período dos sismos',
    tapHint: 'Toca no mapa para ver o tempo e o ar nesse local.',
  },

  time: {
    composite: 'Média 2016',
    prevDay: 'Dia anterior',
    nextDay: 'Dia seguinte',
    pickDate: (d: string) => `Escolher data (${d})`,
    left: 'Esq.',
    right: 'Dir.',
    sameplace: 'Mesmo local',
    sameplaceTitle: 'Desliga para comparar dois lugares diferentes',
    exitCompare: 'Sair da comparação',
    imageType: 'Tipo de imagem',
    nightly: 'Noite a noite',
    compare: 'Comparar',
  },

  legend: {
    temp: 'Temperatura · °C',
    wind: 'Vento · km/h',
    aerosol: 'Aerossóis (fumo, poeira, poluição)',
    clean: 'Limpo',
    dense: 'Denso',
    aurora: 'Probabilidade de aurora · %',
  },

  search: {
    hint: 'Escreve um voo (TAP1234), um lugar (Lisboa) ou “ISS”.',
    searching: 'A procurar…',
    issName: 'Estação Espacial Internacional',
    flight: (country: string, alt: string) => `Voo · ${country} · ${alt} m`,
  },

  card: {
    close: 'Fechar',
    place: 'Local',
    placeError: 'Não foi possível obter o tempo para este local.',
    placeLoading: 'A obter tempo e qualidade do ar…',
    localTime: (t: string) => `${t} hora local`,
    compareKicker: 'Comparação',
    compareTitle: 'Dois locais',
    compareSub: 'A = primeiro ponto, B = este ponto',
    newCompare: 'Nova comparação',
    finish: 'Terminar',
    compareHint: 'Agora toca noutro ponto do mapa para comparar.',
    compareWith: 'Comparar com outro local',
    day: 'dia',
    twilight: 'crepúsculo',
    night: 'noite',
    rows: {
      localTime: 'Hora local', weather: 'Tempo', temp: 'Temperatura', feels: 'Sensação', wind: 'Vento',
      humidity: 'Humidade', clouds: 'Nuvens', precip: 'Precipitação', air: 'Qualidade do ar', pm25: 'PM2.5', sun: 'Sol', aurora: 'Aurora',
    },
    sunAbove: (d: string) => `${d}° acima`,
    sunBelow: (d: string) => `${d}° abaixo`,
    flight: 'Voo',
    altitude: 'Altitude',
    speed: 'Velocidade',
    heading: 'Rumo',
    vertical: 'Vertical',
    position: 'Posição',
    data: 'Dados',
    realtime: 'tempo real',
    center: 'Centrar',
    quake: 'Sismo',
    depth: 'Profundidade',
    when: 'Quando',
    tsunami: 'Tsunami',
    tsunamiYes: 'Alerta emitido',
    tsunamiNo: 'Sem alerta',
    source: 'Fonte',
    openUsgs: 'Abrir no USGS',
    fire: 'Incêndio',
    fireZone: 'Zona ativa (~5 km)',
    power: 'Potência',
    confidence: 'Confiança',
    confLevels: ['Baixa', 'Normal', 'Alta'],
    detected: 'Detetado',
    detections: 'Deteções',
    volcano: 'Vulcão',
    activeSince: 'Em atividade desde',
    status: 'Estado',
    ongoing: 'Em curso',
    storm: 'Tempestade',
    maxWind: 'Vento máximo',
    lastPosition: 'Última posição',
    since: 'Desde',
    trackPoints: 'Pontos da trajetória',
    viewSource: 'Ver fonte',
    station: 'Estação espacial',
    latitude: 'Latitude',
    longitude: 'Longitude',
    following: 'A seguir',
    follow: 'Seguir',
  },

  weather: {
    clear: 'Céu limpo', partly: 'Pouco nublado', overcast: 'Nublado', fog: 'Nevoeiro', drizzle: 'Chuvisco',
    rain: 'Chuva', snow: 'Neve', showers: 'Aguaceiros', snowShowers: 'Aguaceiros de neve', storm: 'Trovoada',
  },
  aqi: ['Boa', 'Razoável', 'Moderada', 'Fraca', 'Muito fraca', 'Extremamente fraca'],
};

export type Dict = typeof pt;

const en: Dict = {
  locale: 'en-GB',
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  compass: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  east: 'E',
  west: 'W',
  now: 'now',

  page: {
    description: 'Flights, earthquakes, wildfires, wind, clouds, night lights and the ISS in real time, on a 3D globe or a map.',
    mapRegion: 'Interactive map',
    view: 'View',
    globe: 'Globe',
    map: 'Map',
    search: 'Search',
    theme: 'Toggle theme',
    language: 'Mudar a língua para português',
    searchLabel: 'Search a flight, place or the ISS',
    searchPlaceholder: 'Flight (e.g. BAW123), place or ISS',
    results: 'Results',
    layers: 'Layers',
    themes: 'Themes',
    github: 'Source code on GitHub',
    sources: 'Data sources',
    detail: 'Details',
    credits: 'Credits',
    close: 'Close',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    loading: 'Loading…',
    srcFlights: 'Flights',
    srcQuakes: 'Earthquakes',
    srcFires: 'Wildfires',
    srcEvents: 'Volcanoes and storms',
    srcIss: 'ISS',
    srcWeather: 'Wind and temperature',
    srcClouds: 'Clouds',
    srcRadar: 'Rain radar',
    srcImagery: 'Satellite, lights, pollution',
    srcPoint: 'Weather and air at a point',
    srcBasemap: 'Base map',
    srcAurora: 'Auroras',
    install: 'Install app',
  },

  pwa: {
    iosHint: 'To install: tap Share (□↑) and then “Add to Home Screen”.',
  },

  groups: { move: 'Movement', nature: 'Nature', climate: 'Weather', night: 'Night' },
  layers: {
    flights: 'Flights', iss: 'ISS', quakes: 'Earthquakes', fires: 'Wildfires', volcanoes: 'Volcanoes', storms: 'Storms',
    wind: 'Wind', temp: 'Temperature', radar: 'Rain (radar)', clouds: 'Clouds', satellite: 'Satellite',
    aerosol: 'Smoke & pollution', lights: 'Night lights', aurora: 'Auroras', daynight: 'Day & night',
  },

  live: {
    offline: 'Offline',
    justNow: 'Updated just now',
    ago: (t) => `Updated ${t} ago`,
  },

  sub: {
    unavailable: 'Unavailable right now',
    flights: (n, when) => `${n} airborne · ${when}`,
    realtime: 'real time',
    iss: 'Live orbit',
    period: { hour: 'last hour', day: 'last 24 h', week: 'last 7 days' },
    fires: (n) => `${n} active areas · 24 h`,
    volcanoes: (n) => `${n} with ongoing activity`,
    storms: (n) => `${n} active now`,
    noStorms: 'None active now',
    gfsAt: (time) => `GFS forecast for ${time}`,
    gfs: 'NOAA GFS global model',
    radarAt: (when) => `Radar · ${when}`,
    radar: 'Weather radars',
    clouds: 'Geostationary satellites · EUMETSAT',
    satelliteOn: (d) => `True colour · ${d}`,
    satellite: "Today's real image (NASA)",
    aerosolOn: (d) => `Aerosols · ${d}`,
    aerosol: 'Smoke, dust and pollution',
    lightsComposite: 'Cloud-free composite · 2016',
    lightsNight: (d) => `Night of ${d}`,
    lights: 'Cities seen at night (NASA)',
    daynight: 'Sun and twilight now',
    aurora: 'NOAA forecast for the next hour',
    auroraOn: (kp, max) => `Kp ${kp} now · max ${max} in the next 24 h`,
  },

  extra: {
    flights: 'Flights',
    flightSource: 'Flight source',
    every15: 'Every 15 min',
    realtime: 'Real time',
    quakes: 'Earthquakes',
    quakePeriod: 'Earthquake period',
    tapHint: 'Tap the map to see the weather and air there.',
  },

  time: {
    composite: '2016 average',
    prevDay: 'Previous day',
    nextDay: 'Next day',
    pickDate: (d) => `Pick a date (${d})`,
    left: 'Left',
    right: 'Right',
    sameplace: 'Same place',
    sameplaceTitle: 'Turn off to compare two different places',
    exitCompare: 'Exit comparison',
    imageType: 'Image type',
    nightly: 'Night by night',
    compare: 'Compare',
  },

  legend: {
    temp: 'Temperature · °C',
    wind: 'Wind · km/h',
    aerosol: 'Aerosols (smoke, dust, pollution)',
    clean: 'Clean',
    dense: 'Dense',
    aurora: 'Aurora probability · %',
  },

  search: {
    hint: 'Type a flight (BAW123), a place (London) or “ISS”.',
    searching: 'Searching…',
    issName: 'International Space Station',
    flight: (country, alt) => `Flight · ${country} · ${alt} m`,
  },

  card: {
    close: 'Close',
    place: 'Place',
    placeError: 'Could not get the weather for this place.',
    placeLoading: 'Getting weather and air quality…',
    localTime: (t) => `${t} local time`,
    compareKicker: 'Comparison',
    compareTitle: 'Two places',
    compareSub: 'A = first point, B = this point',
    newCompare: 'New comparison',
    finish: 'Done',
    compareHint: 'Now tap another point on the map to compare.',
    compareWith: 'Compare with another place',
    day: 'day',
    twilight: 'twilight',
    night: 'night',
    rows: {
      localTime: 'Local time', weather: 'Weather', temp: 'Temperature', feels: 'Feels like', wind: 'Wind',
      humidity: 'Humidity', clouds: 'Clouds', precip: 'Precipitation', air: 'Air quality', pm25: 'PM2.5', sun: 'Sun', aurora: 'Aurora',
    },
    sunAbove: (d) => `${d}° above`,
    sunBelow: (d) => `${d}° below`,
    flight: 'Flight',
    altitude: 'Altitude',
    speed: 'Speed',
    heading: 'Heading',
    vertical: 'Vertical',
    position: 'Position',
    data: 'Data',
    realtime: 'real time',
    center: 'Centre',
    quake: 'Earthquake',
    depth: 'Depth',
    when: 'When',
    tsunami: 'Tsunami',
    tsunamiYes: 'Alert issued',
    tsunamiNo: 'No alert',
    source: 'Source',
    openUsgs: 'Open on USGS',
    fire: 'Wildfire',
    fireZone: 'Active area (~5 km)',
    power: 'Power',
    confidence: 'Confidence',
    confLevels: ['Low', 'Nominal', 'High'],
    detected: 'Detected',
    detections: 'Detections',
    volcano: 'Volcano',
    activeSince: 'Active since',
    status: 'Status',
    ongoing: 'Ongoing',
    storm: 'Storm',
    maxWind: 'Max wind',
    lastPosition: 'Last position',
    since: 'Since',
    trackPoints: 'Track points',
    viewSource: 'View source',
    station: 'Space station',
    latitude: 'Latitude',
    longitude: 'Longitude',
    following: 'Following',
    follow: 'Follow',
  },

  weather: {
    clear: 'Clear sky', partly: 'Partly cloudy', overcast: 'Overcast', fog: 'Fog', drizzle: 'Drizzle',
    rain: 'Rain', snow: 'Snow', showers: 'Showers', snowShowers: 'Snow showers', storm: 'Thunderstorm',
  },
  aqi: ['Good', 'Fair', 'Moderate', 'Poor', 'Very poor', 'Extremely poor'],
};

const DICTS: Record<Lang, Dict> = { pt, en };

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('earthlive:lang');
    if (saved === 'pt' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

let current: Lang = initialLang();
const listeners: (() => void)[] = [];

export const getLang = (): Lang => current;
export const t = (): Dict => DICTS[current];

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem('earthlive:lang', lang);
  } catch {
    /* preference just won't persist */
  }
  applyStatic();
  for (const fn of listeners) fn();
}

export function onLangChange(fn: () => void): void {
  listeners.push(fn);
}

/**
 * Translates the static HTML: data-i18n (text), data-i18n-aria (aria-label),
 * data-i18n-placeholder and data-i18n-title, all keyed into `page`.
 */
export function applyStatic(): void {
  const p = t().page as Record<string, string>;
  document.documentElement.lang = current;
  document.querySelector('meta[name="description"]')?.setAttribute('content', p.description);
  for (const n of document.querySelectorAll<HTMLElement>('[data-i18n]')) n.textContent = p[n.dataset.i18n!] ?? n.textContent;
  for (const n of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) n.setAttribute('aria-label', p[n.dataset.i18nAria!]);
  for (const n of document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]')) n.setAttribute('placeholder', p[n.dataset.i18nPlaceholder!]);
}

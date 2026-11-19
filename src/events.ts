/** Natural events from NASA EONET (no key, CORS enabled). */

export interface NaturalEvent {
  id: string;
  kind: 'volcanoes' | 'storms';
  title: string;
  lng: number;
  lat: number;
  /** epoch ms of the latest observation */
  time: number;
  firstTime: number;
  /** storms: full track, oldest first */
  track: [number, number][];
  /** storms: max sustained wind in knots, when known */
  windKts: number | null;
  sourceUrl: string | null;
}

interface EonetEvent {
  id: string;
  title: string;
  categories: { id: string }[];
  sources: { url: string }[];
  geometry: { date: string; type: string; coordinates: unknown; magnitudeValue: number | null; magnitudeUnit: string | null }[];
}

export async function loadEvents(): Promise<NaturalEvent[]> {
  // Volcano events stay open for months (their date is when activity began),
  // storms only matter while recent.
  const base = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open';
  const [volc, storms] = await Promise.all(
    [`${base}&category=volcanoes`, `${base}&category=severeStorms&days=30`].map(async (url) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`EONET ${res.status}`);
      return ((await res.json()) as { events: EonetEvent[] }).events;
    }),
  );
  const out: NaturalEvent[] = [];
  for (const e of [...volc, ...storms]) {
    const cat = e.categories[0]?.id;
    const kind = cat === 'volcanoes' ? 'volcanoes' : cat === 'severeStorms' ? 'storms' : null;
    if (!kind) continue;
    const pts = e.geometry
      .filter((g) => g.type === 'Point' && Array.isArray(g.coordinates))
      .map((g) => ({ c: g.coordinates as [number, number], t: Date.parse(g.date), m: g.magnitudeValue, u: g.magnitudeUnit }))
      .sort((a, b) => a.t - b.t);
    const last = pts.at(-1);
    if (!last) continue;
    const winds = pts.filter((p) => p.m != null && p.u === 'kts').map((p) => p.m as number);
    const src = e.sources.find((s) => /^https:\/\//.test(s.url))?.url ?? null;
    out.push({
      id: e.id,
      kind,
      title: e.title,
      lng: last.c[0],
      lat: last.c[1],
      time: last.t,
      firstTime: pts[0].t,
      track: pts.map((p) => p.c),
      windKts: winds.length ? Math.max(...winds) : null,
      sourceUrl: src,
    });
  }
  return out;
}

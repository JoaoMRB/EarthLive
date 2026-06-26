# Earth Live

**Earth Live** is an interactive 3‑D globe that visualises real‑time (or near‑real‑time) geospatial data: flights, earthquakes, fire hotspots and the International Space Station. The data is aggregated by a lightweight Node backend and rendered in the browser with **Globe.gl**, **Three.js**, **Angular 19 (standalone)** and **Tailwind CSS**.

---

## Project status

✅ **Functional monorepo** – API + Angular SSR + globe with point‑click interaction.

🗂️ **Tasks & coordination** – see `task.md` and `COORDINATION.md`.

---

## Quick overview

| Layer | Source | Typical refresh | Current implementation |
|-------|--------|----------------|------------------------|
| Flights | [OpenSky Network](https://opensky-network.org/) | ~1–2 min (cached 120 s) | API endpoint → Globe.gl points (≈ 2.5k sampled) |
| Earthquakes | [USGS Earthquake API](https://earthquake.usgs.gov/) | 1–5 min | API endpoint → pulsating rings |
| Fires | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | ~3 h (last 24‑48 h) | API endpoint (requires `NASA_FIRMS_KEY`) → hex‑bin visualisation |
| ISS | [Open Notify](http://open-notify.org/) | ~5–10 s | Direct API call → label & orbit trail |

### Out‑of‑scope (for now)
- Real‑time lightning (no public REST API).
- Detailed aircraft origin/destination (requires commercial providers).
- "Zero‑backend" approach – a tiny backend is required for CORS handling and caching.

---

## Architecture diagram

```
APIs (external) ──► Backend (Node/Express) ──► Frontend (Angular SSR)
                         │ cache (2‑5 min)          │ Globe.gl + Tailwind
                         └─► optional Supabase (auth, prefs)
```

### Why a backend?
Most public APIs cannot be called reliably from the browser (CORS, rate limits). The backend:
1. Retrieves external feeds.
2. Applies a shared cache (2‑5 min) to reduce traffic.
3. Normalises payloads for the frontend.

### Stack
| Layer | Tech |
|-------|------|
| Frontend | Angular 19 (standalone), SSR, Globe.gl, Tailwind, RxJS |
| Backend | Node 18, Express (lightweight), optional Supabase |
| Deploy | Vercel, Railway, Docker, etc. |

---

## Repository layout
```
earthlive/
├─ apps/
│  ├─ api/          # Express server (port 3000)
│  │  └─ src/
│  └─ web/          # Angular 19 SSR application (port 4200)
│      └─ src/app/
│          ├─ core/          # models & services
│          └─ features/      # globe component, control panel, stats bar
├─ .env.example
├─ package.json      # workspaces + npm scripts
└─ README.md
```

---

## Backend API contract
### `GET /api/earth-data`
Aggregated payload containing flights, earthquakes, fires and a `meta` block.
```json
{
  "flights": [{"id":"…","callsign":"…","lat":38.72,"lng":-9.13,"alt":10972,"speed":900,"heading":45,"country":"PT"}],
  "quakes": [{"id":"…","lat":19.19,"lng":-155.28,"depth":35.2,"magnitude":4.5,"place":"…","time":1699876543000,"tsunami":false}],
  "fires": [{"lat":-10.1,"lng":-55.2,"brightness":320,"confidence":"high","datetime":"2024-01-15 14:30"}],
  "timestamp":1699876543000,
  "meta": {
    "flightCount": 12847,
    "quakeCount": 23,
    "fireCount": 412,
    "strongestQuake": null
  }
}
```
- Server‑side cache: **120 s** (configurable).
- Frontend polls ~30 s (earth‑data) and ~10 s (ISS).

### `GET /api/iss`
Current ISS position (and optional crew list).

---

## Performance considerations (browser)
- **Viewport culling** – render only points inside the camera view.
- **Level‑of‑Detail (LOD)** – sampled point sets for low zoom levels.
- **Throttling** – RxJS `throttleTime` on camera moves.
- **Web Worker** – heavy clustering / hex‑bin calculation off the main thread.
- **Hex‑bin** for fire hotspots.
- Target FPS: ~60 desktop, ~30 mobile.

---

## Environment variables
| Variable | Required? | Description |
|----------|-----------|-------------|
| `OPENSKY_USER` | optional | OpenSky account (higher rate limit) |
| `OPENSKY_PASS` | optional | Password for the account |
| `NASA_FIRMS_KEY` | optional (required for fire data) | API key for NASA FIRMS |
| `SUPABASE_URL` | optional | Supabase instance (auth/prefs) |
| `SUPABASE_ANON_KEY` | optional | Public Supabase key |

Copy `.env.example` to `.env` at the repository root.

---

## Getting started (local development)
```bash
# install dependencies
npm install

# create env file (optional variables)
cp .env.example .env

# run both API and web concurrently
npm run dev   # API on :3000, Angular on :4200
```
- API proxy is configured via `proxy.conf.json` (Angular forwards `/api` to `http://localhost:3000`).
- Open `http://localhost:4200` in your browser.

---

## Building for production
```bash
npm run build   # builds API and Angular SSR assets
```
The output is placed in `apps/api/dist` and `apps/web/dist/web`.

---

## Contributing & future work
- Replace the default textures with 4 K / 8 K assets (e.g., NASA Blue Marble) – already switched to a higher‑resolution map in `GlobeManagerService`.
- Add optional night‑time texture for a day/night transition.
- Implement Supabase‑backed user preferences (layer toggles, favourite locations).
- Deploy to a serverless platform (Vercel, Railway) with CI/CD.
- Expand the data layer (e.g., real‑time lightning, ship AIS).

---

## Honesty in the portfolio
- **Do not claim:** “100 % real‑time”, “zero backend”, “live lightning”.
- **Do say:** “Public data updated every 1‑5 min (source‑dependent)”, “lightweight backend for CORS & caching”, “four core data sources: OpenSky, USGS, NASA FIRMS, Open Notify”, “LOD and viewport‑culling keep the globe smooth”.

---

## License & third‑party data
Respect the terms of each upstream API. This project is for educational / portfolio use unless otherwise noted.

---

## Credits
- [Globe.gl](https://github.com/vasturiano/globe.gl) / Three.js
- OpenSky Network, USGS, NASA FIRMS, Open Notify
- Tailwind CSS, Angular, RxJS

---

*Last updated: 2026‑05‑26*
// Global weather snapshot from NOAA GFS (1° grid, public domain).
//
// Downloads 10 m wind (U, V) and 2 m temperature for the latest available
// model run through NOMADS' GRIB filter, decodes the GRIB2 messages (complex
// packing + spatial differencing, template 5.3) in pure JavaScript and encodes
// the result as a small PNG the browser can sample:
//   R = U wind, G = V wind, B = temperature  (ranges in weather.json)
// Image: 360×181, row 0 = 90°N, column 0 = 180°W, 1° steps.

import { deflateSync } from 'node:zlib';

export const RANGES = { u: [-50, 50], v: [-50, 50], t: [-70, 50] }; // m/s, m/s, °C

const NOMADS = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl';

/** Tries the most recent GFS cycles until one is published. */
export async function fetchGfs() {
  const now = Date.now();
  for (let back = 4; back <= 30; back += 6) {
    const d = new Date(now - back * 3600_000);
    const cycle = String(Math.floor(d.getUTCHours() / 6) * 6).padStart(2, '0');
    const day = d.toISOString().slice(0, 10).replaceAll('-', '');
    const runTime = Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8), +cycle) / 1000;
    // Forecast step closest to now (3-hourly), so the map shows the current weather.
    const fh = Math.max(0, Math.min(384, Math.round((now / 1000 - runTime) / 10800) * 3));
    const qs = new URLSearchParams({
      dir: `/gfs.${day}/${cycle}/atmos`,
      file: `gfs.t${cycle}z.pgrb2.1p00.f${String(fh).padStart(3, '0')}`,
      var_UGRD: 'on', var_VGRD: 'on', var_TMP: 'on',
      lev_10_m_above_ground: 'on', lev_2_m_above_ground: 'on',
    });
    const res = await fetch(`${NOMADS}?${qs}`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000 || buf.toString('ascii', 0, 4) !== 'GRIB') continue;
    const fields = decodeGrib2(buf);
    const t = fields.find((f) => f.cat === 0 && f.param === 0);
    const u = fields.find((f) => f.cat === 2 && f.param === 2);
    const v = fields.find((f) => f.cat === 2 && f.param === 3);
    if (!t || !u || !v) continue;
    return { runTime, validTime: runTime + fh * 3600, nx: u.nx, ny: u.ny, u: u.values, v: v.values, t: t.values };
  }
  throw new Error('no GFS cycle available');
}

/** Encodes the fields as an RGB PNG with longitudes shifted to start at -180°. */
export function encodeWeatherPng({ nx, ny, u, v, t }) {
  const px = Buffer.alloc((nx * 3 + 1) * ny);
  const q = (x, [lo, hi]) => Math.max(0, Math.min(255, Math.round(((x - lo) / (hi - lo)) * 255)));
  for (let y = 0; y < ny; y++) {
    const row = y * (nx * 3 + 1);
    px[row] = 0; // filter: none
    for (let x = 0; x < nx; x++) {
      const src = y * nx + ((x + nx / 2) % nx); // GFS starts at 0°E
      const o = row + 1 + x * 3;
      px[o] = q(u[src], RANGES.u);
      px[o + 1] = q(v[src], RANGES.v);
      px[o + 2] = q(t[src] - 273.15, RANGES.t);
    }
  }
  return png(nx, ny, px);
}

// ---------- GRIB2 decoding (only what GFS 1° filtered output uses) ----------

export function decodeGrib2(buf) {
  const out = [];
  let o = 0;
  while (o + 16 <= buf.length && buf.toString('ascii', o, o + 4) === 'GRIB') {
    const len = Number(buf.readBigUInt64BE(o + 8));
    let p = o + 16;
    const end = o + len - 4;
    const msg = {};
    while (p < end) {
      const sl = buf.readUInt32BE(p);
      const sn = buf[p + 4];
      const s = buf.subarray(p, p + sl);
      if (sn === 3) {
        if (s.readUInt16BE(12) !== 0) throw new Error('unsupported grid template');
        msg.nx = s.readUInt32BE(30);
        msg.ny = s.readUInt32BE(34);
      } else if (sn === 4) {
        msg.cat = s[9];
        msg.param = s[10];
      } else if (sn === 5) {
        msg.s5 = s;
      } else if (sn === 6) {
        if (s[5] !== 255) throw new Error('bitmaps not supported');
      } else if (sn === 7) {
        msg.values = unpackComplex(msg.s5, s.subarray(5));
        out.push(msg);
      }
      p += sl;
    }
    o += len;
  }
  return out;
}

const signMag16 = (n) => (n & 0x8000 ? -(n & 0x7fff) : n);

function readSignMag(data, off, bytes) {
  let v = 0;
  for (let i = 0; i < bytes; i++) v = v * 256 + data[off + i];
  const sign = 2 ** (bytes * 8 - 1);
  return v >= sign ? -(v - sign) : v;
}

class Bits {
  constructor(buf, byteOffset) { this.buf = buf; this.pos = byteOffset * 8; }
  read(n) {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const b = this.buf[this.pos >> 3];
      v = v * 2 + ((b >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v;
  }
  align() { this.pos = Math.ceil(this.pos / 8) * 8; }
}

/** Data Representation Template 5.3: complex packing + spatial differencing. */
function unpackComplex(s5, data) {
  const npts = s5.readUInt32BE(5);
  const template = s5.readUInt16BE(9);
  if (template !== 3 && template !== 2) throw new Error(`unsupported packing 5.${template}`);
  const R = s5.readFloatBE(11);
  const E = signMag16(s5.readUInt16BE(15));
  const D = signMag16(s5.readUInt16BE(17));
  const nbits = s5[19];
  const missingMgmt = s5[22];
  if (missingMgmt !== 0) throw new Error('missing value management not supported');
  const NG = s5.readUInt32BE(31);
  const widthRef = s5[35];
  const widthBits = s5[36];
  const lenRef = s5.readUInt32BE(37);
  const lenInc = s5[41];
  const lastLen = s5.readUInt32BE(42);
  const lenBits = s5[46];
  const order = template === 3 ? s5[47] : 0;
  const extra = template === 3 ? s5[48] : 0;

  let off = 0;
  let ival1 = 0, ival2 = 0, minsd = 0;
  if (order >= 1) { ival1 = readSignMag(data, off, extra); off += extra; }
  if (order === 2) { ival2 = readSignMag(data, off, extra); off += extra; }
  if (order >= 1) { minsd = readSignMag(data, off, extra); off += extra; }

  const bits = new Bits(data, off);
  const refs = new Array(NG);
  for (let i = 0; i < NG; i++) refs[i] = bits.read(nbits);
  bits.align();
  const widths = new Array(NG);
  for (let i = 0; i < NG; i++) widths[i] = widthRef + bits.read(widthBits);
  bits.align();
  const lens = new Array(NG);
  for (let i = 0; i < NG; i++) lens[i] = lenRef + bits.read(lenBits) * lenInc;
  lens[NG - 1] = lastLen;
  bits.align();

  const X = new Float64Array(npts);
  let k = 0;
  for (let g = 0; g < NG; g++) {
    const w = widths[g];
    for (let j = 0; j < lens[g] && k < npts; j++) X[k++] = refs[g] + (w ? bits.read(w) : 0);
  }

  if (order === 1) {
    X[0] = ival1;
    for (let i = 1; i < npts; i++) X[i] = X[i] + minsd + X[i - 1];
  } else if (order === 2) {
    X[0] = ival1;
    X[1] = ival2;
    for (let i = 2; i < npts; i++) X[i] = X[i] + minsd + 2 * X[i - 1] - X[i - 2];
  }

  const bs = 2 ** E;
  const ds = 10 ** D;
  const vals = new Float32Array(npts);
  for (let i = 0; i < npts; i++) vals[i] = (R + X[i] * bs) / ds;
  return vals;
}

// ---------- Minimal PNG encoder ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

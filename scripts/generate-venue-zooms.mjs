/**
 * Genera los recortes de puntos del mundo para el zoom de estadio de la
 * página de partido (/partido/[id]). Misma geometría de land-110m (Natural
 * Earth, dominio público) que la portada, muestreada más fina (0.35°) en una
 * ventana de ~20° × 12.6° centrada en el estadio de cada club del catálogo.
 * El PNG y el pin comparten proyección equirectangular, alineados por
 * construcción (src/lib/venues.js · venueZoomLayout).
 *
 * Uso: node scripts/generate-venue-zooms.mjs [land-110m.json]
 * Si falta el TopoJSON se descarga una vez desde jsdelivr y queda en .cache/.
 * Salida: public/img/venue-zoom/{slug}.png (un archivo por club del catálogo)
 * y un PNG por región de reserva (src/lib/venues.js · REGION_MAPS).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLUBS, VENUE_ZOOM, REGION_MAPS } from '../src/lib/venues.js';
import { normalize } from '../src/lib/teams.js';

const SEA = [24, 30, 26];
const LAND = [58, 69, 60];
const RADIUS = 2.6;

const COLS = Math.round(VENUE_ZOOM.lngSpan / VENUE_ZOOM.step);
const ROWS = Math.round(VENUE_ZOOM.latSpan / VENUE_ZOOM.step);
const W = COLS * VENUE_ZOOM.pitch;
const H = ROWS * VENUE_ZOOM.pitch;

const here = path.dirname(fileURLToPath(import.meta.url));
const source = process.argv[2] ?? path.join(here, '.cache', 'land-110m.json');
if (!existsSync(source)) {
  mkdirSync(path.dirname(source), { recursive: true });
  const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json', { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`No se pudo descargar land-110m.json: HTTP ${res.status}`);
  writeFileSync(source, Buffer.from(await res.arrayBuffer()));
  console.log(`land-110m.json descargado a ${source}`);
}
const topology = JSON.parse(readFileSync(source, 'utf8'));

// — decodificación TopoJSON (idéntica a generate-world-dots.mjs) —
function decodeTopology(topology) {
  const { scale, translate } = topology.transform;
  const arcs = topology.arcs.map(arc => {
    const out = [];
    let x = 0, y = 0;
    for (const [dx, dy] of arc) { x += dx; y += dy; out.push([x * scale[0] + translate[0], y * scale[1] + translate[1]]); }
    return out;
  });
  const decodeRing = ring => ring.flatMap(index => {
    const arc = index >= 0 ? arcs[index] : [...arcs[~index]].reverse();
    return index === ring[0] ? arc : arc.slice(1);
  });
  const rings = [];
  for (const geometry of topology.objects.land.geometries) {
    const polygons = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs ?? [];
    for (const polygon of polygons) rings.push(decodeRing(polygon[0]));
  }
  return rings;
}
const rings = decodeTopology(topology);
function inside(lon, lat) {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

// — PNG writer (idéntico a generate-world-dots.mjs) —
function encodePng(pixels, width, height) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    pixels.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = buffer => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Pinta un recorte equirectangular: esquina superior izquierda en (left, top). */
function renderCrop({ left, top, cols, rows, step, pitch }) {
  const w = cols * pitch;
  const h = rows * pitch;
  const pixels = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) pixels.set(SEA, i * 3);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const lon = left + (col + 0.5) * step;
      const lat = top - (row + 0.5) * step;
      if (lat < -90 || lat > 90) continue;
      if (!inside(lon, lat)) continue;
      const cx = (col + 0.5) * pitch, cy = (row + 0.5) * pitch;
      const minX = Math.max(0, Math.floor(cx - RADIUS)), maxX = Math.min(w - 1, Math.ceil(cx + RADIUS));
      const minY = Math.max(0, Math.floor(cy - RADIUS)), maxY = Math.min(h - 1, Math.ceil(cy + RADIUS));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= RADIUS * RADIUS) pixels.set(LAND, (y * w + x) * 3);
      }
    }
  }
  return encodePng(pixels, w, h);
}

const outDir = 'public/img/venue-zoom';
mkdirSync(outDir, { recursive: true });
const used = new Set();
let bytes = 0;
CLUBS.forEach((club, index) => {
  const base = normalize(club.aliases[0]).replace(/ /g, '-');
  const slug = used.has(base) ? `${base}-${index + 1}` : base;
  used.add(slug);
  const png = renderCrop({
    left: club.lng - COLS * VENUE_ZOOM.step / 2,
    top: club.lat + ROWS * VENUE_ZOOM.step / 2,
    cols: COLS, rows: ROWS, step: VENUE_ZOOM.step, pitch: VENUE_ZOOM.pitch,
  });
  writeFileSync(path.join(outDir, `${slug}.png`), png);
  bytes += png.length;
});
/* Mapas de reserva por competición cuando la sede no está en el catálogo:
   el mismo lenguaje de puntos sobre cada región. */
let regionBytes = 0;
for (const region of Object.values(REGION_MAPS)) {
  const cols = Math.round((region.lngMax - region.lngMin) / region.step);
  const rows = Math.round((region.latMax - region.latMin) / region.step);
  const png = renderCrop({
    left: region.lngMin, top: region.latMax,
    cols, rows, step: region.step, pitch: region.pitch,
  });
  writeFileSync(path.join(outDir, region.file), png);
  regionBytes += png.length;
}
console.log(`venue-zoom: ${CLUBS.length} recortes ${W}×${H} px + ${Object.keys(REGION_MAPS).length} regiones · ${((bytes + regionBytes) / 1024).toFixed(0)} KB totales`);

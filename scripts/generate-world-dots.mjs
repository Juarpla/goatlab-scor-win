/**
 * Genera el mapa de puntos del mundo para la región "jornada" de la portada.
 *
 * Fuente de la geometría: land-110m.json de world-atlas v2 (Natural Earth,
 * dominio público, https://github.com/topojson/world-atlas). El script decodifica
 * el TopoJSON, muestrea el interior de tierra firme en una retícula de 2° y
 * pinta un punto por celda en un PNG plano cuyo fondo coincide con la superficie
 * mate del sitio (#181e1a). Los pines de sedes se posicionan por porcentaje con
 * la misma proyección equirectangular (x = (lon+180)/360, y = (90-lat)/180
 * recortada a LAT_TOP..LAT_BOTTOM), así que el PNG y los pines quedan alineados
 * por construcción.
 *
 * Uso:  curl -sL https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json -o land-110m.json
 *       node scripts/generate-world-dots.mjs land-110m.json
 * Salida: public/img/world-dots.png (se sobrescribe).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SEA = [24, 30, 26];    // var(--surface) #181e1a
const LAND = [58, 69, 60];   // punto de tierra, tono entre --line y --raised

// Retícula: 2° por celda; recorte vertical para descartar el océano vacío.
const STEP = 2;
const LAT_TOP = 78;
const LAT_BOTTOM = -58;
const PITCH = 12;            // px por celda en el PNG (el navegador reescala)
const RADIUS = 3.4;          // radio del punto dentro de la celda

const COLS = 360 / STEP;
const LAT_ROWS = 180 / STEP;
const ROW_TOP = Math.round((90 - LAT_TOP) / STEP);        // fila de la primera
const ROWS = Math.round((LAT_TOP - LAT_BOTTOM) / STEP);
const W = COLS * PITCH;
const H = ROWS * PITCH;

function decodeTopology(topology) {
  const { scale, translate } = topology.transform;
  const arcs = topology.arcs.map(arc => {
    const out = [];
    let x = 0, y = 0;
    for (const [dx, dy] of arc) {
      x += dx; y += dy;
      out.push([x * scale[0] + translate[0], y * scale[1] + translate[1]]);
    }
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

function inside(lon, lat, rings) {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

function encodePng(pixels, width, height) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filtro none
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
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, color verdadero RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const [source = 'land-110m.json'] = process.argv.slice(2);
const rings = decodeTopology(JSON.parse(readFileSync(source, 'utf8')));

const pixels = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) pixels.set(SEA, i * 3);
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const lon = -180 + (col + 0.5) * STEP;
    const lat = LAT_TOP - (row + 0.5) * STEP;
    if (!inside(lon, lat, rings)) continue;
    const cx = (col + 0.5) * PITCH, cy = (row + 0.5) * PITCH;
    const minX = Math.max(0, Math.floor(cx - RADIUS)), maxX = Math.min(W - 1, Math.ceil(cx + RADIUS));
    const minY = Math.max(0, Math.floor(cy - RADIUS)), maxY = Math.min(H - 1, Math.ceil(cy + RADIUS));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dist = (x - cx) ** 2 + (y - cy) ** 2;
        if (dist <= RADIUS * RADIUS) pixels.set(LAND, (y * W + x) * 3);
      }
    }
  }
}
mkdirSync('public/img', { recursive: true });
const png = encodePng(pixels, W, H);
writeFileSync('public/img/world-dots.png', png);
const landDots = Array.from({ length: ROWS }, (_, row) =>
  Array.from({ length: COLS }, (_, col) => inside(-180 + (col + 0.5) * STEP, LAT_TOP - (row + 0.5) * STEP, rings) ? 1 : 0).reduce((a, b) => a + b, 0)
).reduce((a, b) => a + b, 0);
console.log(`world-dots.png: ${W}×${H} px · ${landDots} puntos de tierra · ${(png.length / 1024).toFixed(1)} KB`);

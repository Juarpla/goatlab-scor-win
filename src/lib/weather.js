/**
 * Clima por kickoff vía Open-Meteo (gratuito, sin key, 10k llamadas/día).
 * Solo la hora del saque inicial, nunca el hourly completo: el sidecar
 * `weather.json` guarda `{ temp, precipitation, wind, weathercode }` por
 * partido. Futuro → `/v1/forecast` (16 días); pasado → `/v1/archive` (ERA5).
 * Sin coordenadas o sin hora emparejada: null honesto. Atribución CC BY 4.0.
 */
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const HOURLY = 'temperature_2m,precipitation,weathercode,wind_speed_10m';
const CHUNK = 50;

/** Hora del kickoff truncada a la hora UTC que Open-Meteo indexa (`...T15:00`). */
export function kickoffHour(kickoff) {
  const iso = String(kickoff ?? '');
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) ? `${iso.slice(0, 13)}:00` : null;
}

/** Extrae la muestra horaria del kickoff; null si la hora no viene en la respuesta. */
export function sampleHourlyAt(hourly, kickoff) {
  const hour = kickoffHour(kickoff);
  if (!hour || !Array.isArray(hourly?.time)) return null;
  const index = hourly.time.findIndex(time => String(time).slice(0, 13) === hour.slice(0, 13));
  if (index < 0) return null;
  const at = name => hourly?.[name]?.[index] ?? null;
  return {
    temp: at('temperature_2m'),
    precipitation: at('precipitation'),
    weathercode: at('weathercode'),
    wind: at('wind_speed_10m'),
    sampledAt: hourly.time[index],
  };
}

function chunkOf(items, size = CHUNK) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function get(url, fetchImpl) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function coords(points) {
  return {
    latitude: points.map(point => point.lat).join(','),
    longitude: points.map(point => point.lng).join(','),
  };
}

/**
 * Clima de cada punto `{ key, lat, lng, kickoff }`. Devuelve
 * `{ [key]: { temp, precipitation, weathercode, wind, sampledAt, source } }`;
 * las claves sin dato honesto no aparecen. `today` en `YYYY-MM-DD` (UTC).
 */
export async function fetchKickoffWeather(points, { fetchImpl = fetch, today = new Date().toISOString().slice(0, 10) } = {}) {
  const valid = (points ?? []).filter(point => point?.key != null && Number.isFinite(point.lat) && Number.isFinite(point.lng) && kickoffHour(point.kickoff));
  const out = {};
  if (!valid.length) return out;
  const future = valid.filter(point => String(point.kickoff).slice(0, 10) >= today);
  const pastByDate = new Map();
  for (const point of valid.filter(point => String(point.kickoff).slice(0, 10) < today)) {
    const day = String(point.kickoff).slice(0, 10);
    if (!pastByDate.has(day)) pastByDate.set(day, []);
    pastByDate.get(day).push(point);
  }
  for (const group of chunkOf(future)) {
    try {
      const { latitude, longitude } = coords(group);
      const data = await get(`${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}&hourly=${HOURLY}&timezone=UTC&forecast_days=16`, fetchImpl);
      const rows = Array.isArray(data) ? data : [data];
      rows.forEach((row, index) => {
        const sample = sampleHourlyAt(row?.hourly, group[index].kickoff);
        if (sample) out[group[index].key] = { ...sample, source: 'open-meteo-forecast' };
      });
    } catch { /* un chunk caído no tumba al resto; esos partidos quedan sin clima */ }
  }
  for (const [day, rows] of pastByDate) {
    for (const group of chunkOf(rows)) {
      try {
        const { latitude, longitude } = coords(group);
        const data = await get(`${ARCHIVE_URL}?latitude=${latitude}&longitude=${longitude}&start_date=${day}&end_date=${day}&hourly=${HOURLY}&timezone=UTC`, fetchImpl);
        const list = Array.isArray(data) ? data : [data];
        list.forEach((row, index) => {
          const sample = sampleHourlyAt(row?.hourly, group[index].kickoff);
          if (sample) out[group[index].key] = { ...sample, source: 'open-meteo-archive' };
        });
      } catch { /* idem */ }
    }
  }
  return out;
}

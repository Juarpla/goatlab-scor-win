/**
 * Weather per kickoff via Open-Meteo (free, no key, 10k calls/day).
 * Only the kickoff hour, never the full hourly: the `weather.json`
 * sidecar stores `{ temp, precipitation, wind, weathercode }` per
 * match. Future → `/v1/forecast` (16 days); past → `/v1/archive` (ERA5).
 * Without coordinates or a matched hour: honest null. Attribution CC BY 4.0.
 */
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const HOURLY = 'temperature_2m,precipitation,weathercode,wind_speed_10m';
const CHUNK = 50;

/** Kickoff time truncated to the UTC hour Open-Meteo indexes (`...T15:00`). */
export function kickoffHour(kickoff) {
  const iso = String(kickoff ?? '');
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) ? `${iso.slice(0, 13)}:00` : null;
}

/** Extracts the kickoff hourly sample; null if the hour is not in the response. */
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
 * Weather for each point `{ key, lat, lng, kickoff }`. Returns
 * `{ [key]: { temp, precipitation, weathercode, wind, sampledAt, source } }`;
 * keys without honest data do not appear. `today` in `YYYY-MM-DD` (UTC).
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

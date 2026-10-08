/** Operational estimates grouped by UTC month; successful counts are never billing data. */
const counters = value => ({ opsA: Number.isSafeInteger(value?.opsA) && value.opsA >= 0 ? value.opsA : 0, opsB: Number.isSafeInteger(value?.opsB) && value.opsB >= 0 ? value.opsB : 0 });
export function addUsage(ledger, delta = {}, now = Date.now()) {
  const month = new Date(now).toISOString().slice(0, 7);
  const months = {};
  if (ledger?.version === 2 && ledger.months && typeof ledger.months === 'object') {
    for (const [key, row] of Object.entries(ledger.months)) if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(key)) months[key] = { media: counters(row.media), control: counters(row.control) };
  } else if (ledger && (ledger.opsA || ledger.opsB)) {
    const at = Date.parse(ledger.updatedAt);
    const legacyMonth = Number.isFinite(at) ? new Date(at).toISOString().slice(0, 7) : month;
    months[legacyMonth] = { media: counters(ledger), control: counters({}) };
  }
  const current = months[month] ?? { media: counters({}), control: counters({}) };
  for (const group of ['media', 'control']) {
    const inc = counters(delta[group]);
    for (const key of ['opsA', 'opsB']) current[group][key] += inc[key];
  }
  months[month] = current;
  return { version: 2, months, updatedAt: new Date(now).toISOString(), estimated: true };
}
export function monthUsage(ledger, now = Date.now()) {
  const normalized = addUsage(ledger, {}, now);
  const row = normalized.months[new Date(now).toISOString().slice(0, 7)];
  return { opsA: row.media.opsA + row.control.opsA, opsB: row.media.opsB + row.control.opsB, media: row.media, control: row.control };
}

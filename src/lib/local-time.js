/**
 * Times in the visitor's local time (static site: the server prints
 * Lima as the baseline and this script rewrites each time on the client).
 * Agreed chain: visitor → stadium city timezone → Lima.
 * The `data-venue-tz` value arrives when the pipeline exposes the stadium timezone.
 */
const LIMA = 'America/Lima';

export function initLocalTimes() {
  const nodes = [...document.querySelectorAll('[data-kickoff]')];
  if (!nodes.length) return;
  let zone = null;
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { /* sin zona disponible */ }
  for (const node of nodes) {
    const date = new Date(node.dataset.kickoff);
    if (Number.isNaN(date.getTime())) continue;
    const target = zone || node.dataset.venueTz || LIMA;
    const source = zone ? 'visitor' : node.dataset.venueTz ? 'venue' : 'lima';
    const options = { timeZone: target };
    const time = new Intl.DateTimeFormat('es', { ...options, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
    const mode = node.dataset.format || 'datetime';
    let text = time;
    if (mode === 'date') text = new Intl.DateTimeFormat('es', { ...options, weekday: 'long', day: 'numeric', month: 'long' }).format(date);
    else if (mode === 'datetime') text = new Intl.DateTimeFormat('es', { ...options, day: 'numeric', month: 'short' }).format(date) + ' · ' + time;
    if (node.dataset.label === 'off') { node.textContent = text; continue; }
    const label = source === 'visitor' ? (target === LIMA ? '(Lima)' : '(tu hora)') : source === 'venue' ? '(hora del estadio)' : '(Lima)';
    node.textContent = mode === 'date' ? text : `${text} ${label}`;
  }
}

import { shortTitle, playersInNarration } from './youtube.js';
/** Rebuild deterministic title metadata without changing hooks, narration, picks or media. */
export function normalizeScriptTitles(data) {
  const named = { home: data.home, away: data.away };
  return { ...data, scripts: (data.scripts ?? []).map(script => ({ ...script, title: shortTitle({ ...named, n: script.n, hook: script.hook,
    players: [3,4,7,9].includes(Number(script.n)) ? playersInNarration(script.narration, named) : [] }) })) };
}

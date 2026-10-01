/** Prompts y forma de una foto generada con Agnes AI. La red vive en el generador. */
import { esName } from './teams.js';

const TEMPLATES = [
  (home, away) => `Night photo of a packed football stadium, crowd in ${home} and ${away} colours, scarves without any crest or logo, no readable text, no recognizable faces, cinematic, vertical`,
  (home, away) => `Photo of a football stand full of supporters in ${home} colours, scarves raised, no crests, no logos, no recognizable faces, vertical`,
  (home, away) => `Photo of a football on the grass of a stadium lit for a night match, seats in ${home} and ${away} colours far away, no people, no logos, vertical`,
  (home, away) => `Photo of an empty football dressing room, shirts in ${home} colours on pegs, no crest, no sponsor, no faces, vertical`,
  (home, away) => `Photo of an empty press conference room at a football stadium, microphones on a table, a backdrop in ${away} colours without a crest, no people, vertical`,
  (home, away) => `Photo of a football stadium tunnel, lights, no people, no logos, walls in ${home} colours without a crest, vertical`,
];

/** Una consigna por foto que falta. Sin caras ni escudos. */
export function agnesPrompts({ home = '', away = '', count = 0 } = {}) {
  const h = esName(home) || String(home || 'local');
  const a = esName(away) || String(away || 'visita');
  const n = Math.max(0, Number(count) || 0);
  return Array.from({ length: n }, (_, i) => {
    const base = TEMPLATES[i % TEMPLATES.length](h, a);
    const lap = Math.floor(i / TEMPLATES.length);
    return lap ? `${base}, alternate angle ${lap + 1}` : base;
  });
}

export function normalizeAgnesImage({ matchId, index, publicUrl, model, prompt, at = new Date().toISOString() }) {
  const url = String(publicUrl ?? '');
  if (!matchId || !/^https:\/\//.test(url)) return null;
  return {
    source: 'agnes',
    id: `${matchId}-${index}`,
    url,
    page: 'https://agnes-ai.com/',
    photographer: 'Agnes AI',
    photographerUrl: 'https://agnes-ai.com/',
    license: 'AI generated',
    width: 1080,
    height: 1920,
    query: String(prompt ?? ''),
    subject: null,
    motive: 'generated',
    seen: { model: model || 'agnes-image-2.1-flash', at },
  };
}

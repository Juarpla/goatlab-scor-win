/** Prompts y forma de una foto generada con Agnes AI. La red vive en el generador. */
import { esName } from './teams.js';
import { NEUTRAL_KIT, teamColors } from './team-colors.js';

function kitPhrase(name) {
  const label = esName(name) || String(name || 'the team');
  const colors = teamColors(name);
  if (colors === NEUTRAL_KIT) return `the national team kit of ${label}`;
  return `a shirt in ${colors.primary} with trim in ${colors.secondary}, the kit of ${label}, no crest and no readable sponsor`;
}

function scenes(home, away) {
  const homeKit = kitPhrase(home);
  const awayKit = kitPhrase(away);
  const homeName = esName(home) || home;
  const awayName = esName(away) || away;
  return [
    `Photo of adult men at a football training session, wearing ${homeKit}, no women, no match, no crest, no readable text, vertical`,
    `Photo of adult men at a football training session, wearing ${awayKit}, no women, no match, no crest, no readable text, vertical`,
    `Photo of an adult male footballer in a sit-down interview, wearing ${homeKit}, microphones, no women, no match, no crest, no readable text, vertical`,
    `Photo of adult male footballers walking off a team bus, wearing ${awayKit}, no women, no match, no crest, no readable text, vertical`,
    `Photo of adult male supporters in the colours of ${homeName} and ${awayName}, scarves raised, no women, no crest, no readable text, no recognizable faces, vertical`,
  ];
}

/** El primer 429 reintenta esa foto. El segundo corta el lote. */
export function agnesAfter429(failures) {
  return Number(failures) >= 2 ? 'stop' : 'retry';
}

/** Una consigna por foto que falta. Primero el jugador con el balón. */
export function agnesPrompts({ home = '', away = '', count = 0 } = {}) {
  const bank = scenes(home, away);
  const n = Math.max(0, Number(count) || 0);
  return Array.from({ length: n }, (_, i) => {
    const base = bank[i % bank.length];
    const lap = Math.floor(i / bank.length);
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

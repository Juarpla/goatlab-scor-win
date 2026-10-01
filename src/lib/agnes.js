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
  return [
    `Photo of a footballer controlling the ball at his feet, wearing ${homeKit}, match lighting, no readable text, vertical`,
    `Photo of a footballer controlling the ball at his feet, wearing ${awayKit}, match lighting, no readable text, vertical`,
    `Photo of a footballer dribbling, ball glued to the boot, wearing ${homeKit}, sideline view, no readable text, vertical`,
    `Photo of a footballer shielding the ball, wearing ${awayKit}, night match, no readable text, vertical`,
    `Photo of a national team training session, players in ${homeKit}, ball at their feet, no crest, no readable text, vertical`,
    `Photo of a football stand full of supporters in the colours of ${esName(home) || home}, scarves raised, no crest, no readable text, no recognizable faces, vertical`,
    `Night photo of a packed football stadium before kickoff, crowd in the colours of ${esName(home) || home} and ${esName(away) || away}, no crest, no readable text, vertical`,
    `Photo of a football press conference, coach and microphones, backdrop in the colours of ${esName(away) || away}, no crest, no readable text, vertical`,
  ];
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

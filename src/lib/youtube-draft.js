import { extractJson } from './llm.js';
import { acceptYoutubeDraft, normalizeYoutubeDraft, withMatchDate, numbersInText } from './youtube.js';

/** Keep validated scripts across repairs without mixing provider attribution. */
export function createYoutubeDraftValidator({ facts, published }) {
  let currentProvider;
  let accepted = new Map();
  let acceptedLede = null;
  let previousDraft = null;
  return (content, { provider = 'default' } = {}) => {
    if (provider !== currentProvider) {
      currentProvider = provider;
      accepted = new Map();
      acceptedLede = null;
      previousDraft = null;
    }
    const raw = extractJson(content);
    let candidate = normalizeYoutubeDraft(raw);
    const patches = candidate?.scripts;
    // A repair may contain only rejected numbered entries. It cannot create a
    // partial publication or borrow entries from a different provider.
    if (previousDraft && Array.isArray(patches) && patches.length < 10
      && (patches.length > 0 || typeof raw.lede === 'string')
      && patches.every(script => Number.isInteger(script.n) && script.n >= 1 && script.n <= 10)
      && new Set(patches.map(script => script.n)).size === patches.length) {
      const scripts = structuredClone(previousDraft.scripts);
      for (const patch of patches) scripts[patch.n - 1] = patch;
      candidate = { ...previousDraft, ...candidate, lede: raw.lede === undefined ? previousDraft.lede : candidate.lede, scripts };
    }
    const draft = withMatchDate(candidate, facts.dateText);
    if (draft?.scripts?.length === 10) {
      for (const [index, script] of accepted) draft.scripts[index] = structuredClone(script);
    }
    if (acceptedLede) draft.lede = acceptedLede;
    const errors = acceptYoutubeDraft(draft, { facts, published, editorial: true, structured: true });
    if (draft?.scripts?.length === 10) {
      for (const [index, script] of draft.scripts.entries()) {
        if (errors.some(error => error.startsWith(`guion ${index + 1}:`))) accepted.delete(index);
        else accepted.set(index, structuredClone(script));
      }
      if (!errors.some(error => !/^guion \d+:/.test(error))) acceptedLede = draft.lede;
      previousDraft = structuredClone(draft);
    }
    if (errors.length) {
      const error = new Error(errors.slice(0, 8).join('; '));
      error.validationErrors = errors;
      error.draft = draft;
      error.repairHints = (draft?.scripts ?? []).flatMap((script, index) => {
        if (!errors.some(message => message.startsWith(`guion ${index + 1}:`) && message.includes('cifras, máximo'))) return [];
        const ledger = (Array.isArray(script.narration) ? script.narration : [])
          .filter(beat => beat.beat !== 'fecha')
          .map(beat => `${beat.beat}: [${numbersInText(beat.text).join(', ')}]`).join('; ');
        return [`Guion ${index + 1}, cifras por golpe: ${ledger}. Reduce los datos a UNA cifra histórica y reserva DOS para la proyección; la fecha no cuenta.`];
      });
      throw error;
    }
    return draft;
  };
}

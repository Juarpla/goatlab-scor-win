import { extractJson } from './llm.js';
import { acceptYoutubeDraft, normalizeYoutubeDraft, withMatchDate } from './youtube.js';

/** Keep validated scripts across repairs without mixing provider attribution. */
export function createYoutubeDraftValidator({ facts, published }) {
  let currentProvider;
  let accepted = new Map();
  let acceptedLede = null;
  return (content, { provider = 'default' } = {}) => {
    if (provider !== currentProvider) {
      currentProvider = provider;
      accepted = new Map();
      acceptedLede = null;
    }
    const draft = withMatchDate(normalizeYoutubeDraft(extractJson(content)), facts.dateText);
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
    }
    if (errors.length) {
      const error = new Error(errors.slice(0, 8).join('; '));
      error.validationErrors = errors;
      error.draft = draft;
      throw error;
    }
    return draft;
  };
}

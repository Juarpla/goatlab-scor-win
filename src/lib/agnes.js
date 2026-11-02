/** Prompts and shape for an Agnes AI-generated photo. Networking lives in the generator. */
// Local admission remains below these documented provider limits.
export const AGNES_FREE_LIMITS = Object.freeze({ imageRpm: Object.freeze({ '1K':10, '2K':5, '3K':1, '4K':1 }), videoRpm:1, dailyImages:null, dailyVideoSeconds:null });
// Token Plan Starter (Token key): provider effective quotas and RPM,
// plus the conservative operative pace this repo uses to spread the month.
export const AGNES_TOKEN_LIMITS = Object.freeze({ plan: 'starter',
  imageRpm: Object.freeze({ '1K':100, '2K':80, '3K':1, '4K':1 }), videoRpm:5,
  dailyImages:4000, dailyVideoSeconds:500,
  operative: Object.freeze({ imageRpm:12, videoStartSeconds:30, dailyVideoSeconds:360, dailyVideoMatches:20 }) });

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
    width: 1472,
    height: 2624,
    query: String(prompt ?? ''),
    subject: null,
    motive: 'generated',
    generated: { model: model || 'agnes-image-2.5-flash', at },
  };
}

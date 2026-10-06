/** Prompts y forma de una foto generada con Agnes AI. La red vive en el generador. */
// Local admission remains below these documented provider limits.
export const AGNES_FREE_LIMITS = Object.freeze({ imageRpm: Object.freeze({ '1K':10, '2K':5, '3K':1, '4K':1 }), videoRpm:1, dailyImages:null, dailyVideoSeconds:null });

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

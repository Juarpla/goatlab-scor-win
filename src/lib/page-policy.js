/** Production tools keep their public URLs, outside search and advertising. */
export function isProductionPage(url) {
  const path = new URL(url, 'https://goatlab.win').pathname;
  return /^\/partido\/[^/]+\/(?:scripts|image-prompts|motion-prompts|video-prompts|media|youtube)(?:\/|\.json|$)/.test(path);
}

export function robotsDirective(url) {
  const path = new URL(url, 'https://goatlab.win').pathname;
  if (/^\/partido\/[^/]+\/(?:scripts|motion-prompts)\/?$/.test(path)) return 'noindex, nofollow';
  return isIndexablePage(path) ? null : 'noindex, follow';
}

export function isIndexablePage(url) {
  const path = new URL(url, 'https://goatlab.win').pathname;
  // Provider aliases remain usable; only the descriptive canonical goes in search.
  return !isProductionPage(url) && !/^\/partido\/(?:af|fd|bz)-\d+\/?$/.test(path);
}

export function isAdvertisingPage(url) {
  const path = new URL(url, 'https://goatlab.win').pathname;
  // Limit inventory to pages with evergreen publisher content.
  return path === '/' || /^\/metodologia\/?$/.test(path);
}

export function matchPageIds(match) {
  return match.webId && match.webId !== match.id ? [match.webId, match.id] : [match.id];
}

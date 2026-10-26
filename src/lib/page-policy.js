/** Production tools keep their public URLs, outside search and advertising. */
export function isProductionPage(url) {
  const path = new URL(url, 'https://goatlab.win').pathname;
  return /^\/partido\/[^/]+\/(?:scripts|image-prompts|video-prompts|media|youtube)(?:\/|\.json|$)/.test(path);
}

export function isIndexablePage(url) {
  const path = new URL(url, 'https://goatlab.win').pathname;
  // Provider aliases remain usable; only the descriptive canonical goes in search.
  return !isProductionPage(url) && !/^\/partido\/(?:af|fd|bz)-\d+\/?$/.test(path);
}

export function isAdvertisingPage(url) {
  const path = new URL(url, 'https://goatlab.win').pathname;
  // Google requires disclosure pages to remain accessible without ad/CMP tags.
  return isIndexablePage(url) && !/^\/(?:privacidad|cookies)\/?$/.test(path);
}

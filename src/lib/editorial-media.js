import { safeEditorialLink } from './editorial.js';

export function editorialImage(value) {
  if (!value || value.reviewStatus === 'rejected' || !safeEditorialLink(value.url) || value.source !== 'agnes'
    || typeof value.alt !== 'string' || !value.alt.trim()
    || !Number.isInteger(value.width) || value.width < 320
    || !Number.isInteger(value.height) || value.height < 180) return null;
  return value;
}

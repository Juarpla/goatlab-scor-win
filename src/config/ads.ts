/**
 * Google AdSense — central configuration.
 *
 * Site under review: https://goatlab.win
 * Single source for the Publisher ID: environment variable
 * PUBLIC_ADSENSE_PUBLISHER_ID in raw form (pub-XXXXXXXXXXXXXXXX, no prefixes).
 * If it comes with a ca- prefix or junk, it is normalized; without the variable,
 * the literal ID is used (it is not secret: it travels in the HTML and ads.txt).
 *
 * Where each format goes:
 * - PUBLISHER_ID (pub-...) → ads.txt and Funding Choices. Nothing in front.
 * - AD_CLIENT (ca-pub-...) → adsbygoogle.js script and data-ad-slot. Only there.
 *
 * Verification uses the head meta tag and the generated ads.txt.
 * Serving requires PUBLIC_ADSENSE_ENABLED=true after approval and a live CMP check.
 */
const cleaned = (import.meta.env.PUBLIC_ADSENSE_PUBLISHER_ID ?? '').trim().replace(/^ca-/i, '');

export const PUBLISHER_ID = /^pub-\d+$/.test(cleaned) ? cleaned : 'pub-4320512940041280';

export const AD_CLIENT = `ca-${PUBLISHER_ID}`;

export const AD_SLOTS = {
  /** Home · before the recent results section (horizontal) */
  homeArchive: '',
  /** Methodology · after chapter 1 (horizontal) */
  metoCap1: '',
  /** Methodology · after chapter 2 (rectangular) */
  metoCap2: '',
  /** Methodology · close (horizontal) */
  metoCierre: '',
  /** Contact · story close (horizontal) */
  contactoCierre: '',
  /** Match · after the fixture header (rectangular) */
  partidoPrevio: '',
  /** Match · after the chapter story (rectangular) */
  partidoStory: '',
  /** Match · after the pitch (horizontal) */
  partidoCancha: '',
  /** Match · close, before the footer (rectangular) */
  partidoCierre: '',
} as const;

export type AdSlotKey = keyof typeof AD_SLOTS;

export const ADS_SERVING_ENABLED = import.meta.env.PUBLIC_ADSENSE_ENABLED === 'true';
export const ADS_ACTIVE = ADS_SERVING_ENABLED && Object.values(AD_SLOTS).some(Boolean);

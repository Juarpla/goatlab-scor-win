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
 * Review flow (Publisher ID only, no slots):
 * 1. ADS_VERIFICATION enables the script in <head>.
 * 2. Auto Ads is enabled from the AdSense panel, without data-ad-slot.
 * 3. scripts/write-ads-txt.mjs generates public/ads.txt from this same source.
 *
 * After approval:
 * 1. Create the units in AdSense and paste each data-ad-slot into AD_SLOTS.
 * 2. ADS_ACTIVE turns on only when there is at least one slot with an ID.
 * 3. Every <AdSlot/> without a slot stays hidden.
 */
const cleaned = (import.meta.env.PUBLIC_ADSENSE_PUBLISHER_ID ?? '').trim().replace(/^ca-/i, '');

export const PUBLISHER_ID = /^pub-\d+$/.test(cleaned) ? cleaned : 'pub-1972487168739114';

export const AD_CLIENT = `ca-${PUBLISHER_ID}`;

export const AD_SLOTS = {
  /** Methodology · after chapter 1 (horizontal) */
  metoCap1: '',
  /** Methodology · after chapter 2 (rectangular) */
  metoCap2: '',
  /** Methodology · close (horizontal) */
  metoCierre: '',
  /** Contact · after chapter 2 (rectangular) */
  contactoCap2: '',
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

/**
 * Verification for review: the Publisher ID is enough.
 * Loads adsbygoogle.js in <head> of indexable editorial pages.
 */
export const ADS_VERIFICATION = Boolean(AD_CLIENT);

/**
 * Manual ads: only when there is at least one slot with a real ID.
 * During review (Publisher ID only + Auto Ads) it is false on purpose:
 * <AdSlot/> stays hidden and does not push() empty.
 */
export const ADS_ACTIVE = Object.values(AD_SLOTS).some(Boolean);

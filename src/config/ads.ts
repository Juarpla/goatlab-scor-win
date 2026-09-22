/**
 * Google AdSense — configuración central.
 *
 * Sitio en revisión: https://goatlab.win
 * Fuente única del Publisher ID: variable de entorno
 * PUBLIC_ADSENSE_PUBLISHER_ID en crudo (pub-XXXXXXXXXXXXXXXX, sin prefijos).
 * Si viene con prefijo ca- o con basura, se normaliza; sin variable,
 * se usa el ID literal (no es secreto: viaja en el HTML y en ads.txt).
 *
 * Dónde va cada formato:
 * - PUBLISHER_ID (pub-...) → ads.txt y Funding Choices. Nada delante.
 * - AD_CLIENT (ca-pub-...) → script adsbygoogle.js y data-ad-slot. Solo ahí.
 *
 * Flujo de revisión (solo Publisher ID, sin slots):
 * 1. ADS_VERIFICATION activa el script en <head>.
 * 2. Auto Ads se activa desde el panel de AdSense, sin data-ad-slot.
 * 3. scripts/write-ads-txt.mjs genera public/ads.txt desde esta misma fuente.
 *
 * Tras la aprobación:
 * 1. Crea las unidades en AdSense y pega cada data-ad-slot en AD_SLOTS.
 * 2. ADS_ACTIVE se enciende solo cuando hay al menos un slot con ID.
 * 3. Cada <AdSlot/> sin slot sigue mostrando el marcador reservado.
 */
const cleaned = (import.meta.env.PUBLIC_ADSENSE_PUBLISHER_ID ?? '').trim().replace(/^ca-/i, '');

export const PUBLISHER_ID = /^pub-\d+$/.test(cleaned) ? cleaned : 'pub-1972487168739114';

export const AD_CLIENT = `ca-${PUBLISHER_ID}`;

export const AD_SLOTS = {
  /** Metodología · tras el capítulo 1 (horizontal) */
  metoCap1: '',
  /** Metodología · tras el capítulo 2 (rectangular) */
  metoCap2: '',
  /** Metodología · cierre (horizontal) */
  metoCierre: '',
  /** Contacto · tras el capítulo 2 (rectangular) */
  contactoCap2: '',
  /** Contacto · cierre del relato (horizontal) */
  contactoCierre: '',
  /** Partido · tras la cabecera del encuentro (rectangular) */
  partidoPrevio: '',
  /** Partido · tras el relato por capítulos (rectangular) */
  partidoStory: '',
  /** Partido · tras la cancha (horizontal) */
  partidoCancha: '',
  /** Partido · cierre, antes del pie (rectangular) */
  partidoCierre: '',
} as const;

export type AdSlotKey = keyof typeof AD_SLOTS;

/**
 * Verificación para revisión: basta el Publisher ID.
 * Carga adsbygoogle.js en <head> en todas las páginas.
 */
export const ADS_VERIFICATION = Boolean(AD_CLIENT);

/**
 * Anuncios manuales: solo cuando hay al menos un slot con ID real.
 * Durante la revisión (solo Publisher ID + Auto Ads) es false a propósito:
 * los <AdSlot/> muestran el marcador reservado y no hacen push() vacío.
 */
export const ADS_ACTIVE = Object.values(AD_SLOTS).some(Boolean);

/**
 * Google AdSense — configuración central.
 *
 * Para activar anuncios en todo el sitio:
 * 1. Pega tu ID de publisher en AD_CLIENT (formato: ca-pub-XXXXXXXXXXXXXXXX).
 * 2. Pega el ID de cada bloque (data-ad-slot de tu cuenta) en AD_SLOTS.
 * 3. Publica tu archivo ads.txt real en public/ads.txt.
 *
 * Sin credenciales, cada espacio muestra el marcador reservado y el script
 * de AdSense nunca se carga: el sitio no queda bloqueado ni envía peticiones
 * a Google hasta que la cuenta esté aprobada y configurada.
 */
export const AD_CLIENT = '';

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

export const ADS_ACTIVE = Boolean(AD_CLIENT);

// Genera public/ads.txt desde la misma fuente que src/config/ads.ts:
// la env PUBLIC_ADSENSE_PUBLISHER_ID en crudo (sin ca-), con fallback al ID
// literal. ads.txt siempre usa el formato pub-... (nunca ca-...).
import { writeFileSync } from 'node:fs';

const cleaned = (process.env.PUBLIC_ADSENSE_PUBLISHER_ID ?? '').trim().replace(/^ca-/i, '');
const id = /^pub-\d+$/.test(cleaned) ? cleaned : 'pub-1972487168739114';

writeFileSync(new URL('../public/ads.txt', import.meta.url), `google.com, ${id}, DIRECT, f08c47fec0942fa0\n`);

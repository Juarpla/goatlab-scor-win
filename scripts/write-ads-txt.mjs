// Generates public/ads.txt from the same source as src/config/ads.ts:
// the raw PUBLIC_ADSENSE_PUBLISHER_ID env var (no ca-), with a fallback to the
// literal ID. ads.txt always uses the pub-... format (never ca-...).
import { writeFileSync } from 'node:fs';

const cleaned = (process.env.PUBLIC_ADSENSE_PUBLISHER_ID ?? '').trim().replace(/^ca-/i, '');
const id = /^pub-\d+$/.test(cleaned) ? cleaned : 'pub-4320512940041280';

writeFileSync(new URL('../public/ads.txt', import.meta.url), `google.com, ${id}, DIRECT, f08c47fec0942fa0\n`);

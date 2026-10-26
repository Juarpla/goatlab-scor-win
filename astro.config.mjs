// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import { isIndexablePage } from './src/lib/page-policy.js';

// https://astro.build/config
export default defineConfig({
  site: 'https://goatlab.win',
  adapter: cloudflare({ prerenderEnvironment: 'node' }),
  integrations: [sitemap({ filter: isIndexablePage })],
  // This site is fully static (data is baked in at build time) — no sessions,
  // so the adapter must not provision a KV namespace on deploy.
  session: false,
});

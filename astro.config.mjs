// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://goatlab.scor.win',
  adapter: cloudflare({ prerenderEnvironment: 'node' }),
  integrations: [sitemap()],
  // This site is fully static (data is baked in at build time) — no sessions,
  // so the adapter must not provision a KV namespace on deploy.
  session: false,
});

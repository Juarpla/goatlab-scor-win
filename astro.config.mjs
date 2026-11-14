// @ts-check
import { readFile } from 'node:fs/promises';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import { isIndexablePage } from './src/lib/page-policy.js';

// The Worker needs only the performance index columns from this large capture.
const performanceFields = ['shotsOnTarget', 'xg', 'possession', 'corners', 'fouls', 'yellowCards'];
const selectPerformance = side => Object.fromEntries(performanceFields.map(key => [key, side?.[key] ?? null]));
const performanceHistory = {
  name: 'goatlab-performance-history',
  resolveId(source) {
    if (source === 'virtual:performance-history') return '\0virtual:performance-history';
  },
  async load(id) {
    if (id !== '\0virtual:performance-history') return;
    const path = new URL('./public/data/history-stats.json', import.meta.url);
    this.addWatchFile(path.pathname);
    const { rows } = JSON.parse(await readFile(path, 'utf8'));
    const history = rows.filter(row => row.statistics).map(({ date, home, away, statistics }) => ({
      date, home, away, statistics: { home: selectPerformance(statistics.home), away: selectPerformance(statistics.away) },
    }));
    return `export default ${JSON.stringify(history)};`;
  },
};
// https://astro.build/config
export default defineConfig({
  site: 'https://goatlab.win',
  vite: { plugins: [performanceHistory] },
  adapter: cloudflare({ prerenderEnvironment: 'node' }),
  integrations: [sitemap({ filter: isIndexablePage, customSitemaps: ['https://goatlab.win/sitemap-matches.xml'] })],
  // The site does not use sessions,
  // so the adapter must not provision a KV namespace on deploy.
  session: false,
});

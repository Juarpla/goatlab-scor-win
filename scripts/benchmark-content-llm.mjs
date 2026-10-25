/** Real content latency probe. Writes drafts to .cache, never published content. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONTENT_LLM_LIMITS, withFailover, extractJson } from '../src/lib/llm.js';
import { scriptFacts, youtubeUserPayload, acceptYoutubeDraft, countWords, normalizeYoutubeDraft } from '../src/lib/youtube.js';
const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const fixtures = JSON.parse(await readFile('public/data/fixtures.json', 'utf8'));
const match = fixtures.matches.find(m => (m.webId ?? m.id) === args.match) ?? (!args.match && fixtures.matches.find(m => m.status === 'NS'));
if (!match) throw new Error('Usa --match=<webId de fixtures>');
const matchId = match.webId ?? match.id;
async function optional(file) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; return null; } }
const facts = scriptFacts(match, await optional('public/data/scorers.json'), await optional(`public/match-probabilities/${matchId}.json`));
const skill = (await readFile('.agents/skills/redactar-guiones-shorts/SKILL.md', 'utf8')).replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
const published = (await optional('public/data/evaluation-report.json'))?.published === true;
const output = join('.cache/content-llm-benchmark', args.label ?? new Date().toISOString().replace(/[:.]/g, '-'));
const limits = { ...CONTENT_LLM_LIMITS };
if (args['max-tokens']) limits.maxTokens = Math.min(131072, Math.max(1024, Number(args['max-tokens']) || limits.maxTokens));
await mkdir(output, { recursive: true });
const repeats = Math.min(5, Math.max(1, Number(args.runs) || 1));
const models = args.model ? [args.model] : ['deepseek-v4.1-flash', 'glm-5.3-flash'];
const results = [];
// Independent model probes run together; repeats for one model are sequential.
await Promise.all(models.map(async model => {
  for (let run = 1; run <= repeats; run++) {
    const start = Date.now();
    const metadata = { model, run, matchId, reasoningEffort: 'max', ...limits };
    let result;
    try {
      const call = await withFailover([{ role: 'system', content: skill }, { role: 'user', content: `Redacta los 10 guiones de este partido. Responde solo el JSON.\n${JSON.stringify(youtubeUserPayload({ published, facts }))}` }], {
        ...limits,
        env: { ...process.env, SCRIPT_PROVIDER_ORDER: 'OPENCODE_GO_MODEL', OPENCODE_GO_MODEL: model }, orderVar: 'SCRIPT_PROVIDER_ORDER', validate: extractJson,
      });
      await writeFile(join(output, `${model}-${run}.raw.json`), JSON.stringify(call.value, null, 2));
      const draft = normalizeYoutubeDraft(call.value);
      const errors = acceptYoutubeDraft(draft, { facts, published, editorial: true });
      await writeFile(join(output, `${model}-${run}.draft.json`), JSON.stringify(draft, null, 2));
      result = { ...metadata, latencyMs: call.latencyMs, finishReason: call.finishReason, usage: call.usage, valid: !errors.length, errors, words: draft.scripts?.map(s => countWords(s.narration)) };
    } catch (error) {
      result = { ...metadata, latencyMs: Date.now() - start, valid: false, failures: error.details ?? [{ reason: error.message }] };
    }
    results.push(result);
    await writeFile(join(output, `${model}-${run}.result.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
}));
await writeFile(join(output, 'summary.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));

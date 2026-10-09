import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { scriptStructureErrors } from '../src/lib/match-content.js';
import { scriptFacts } from '../src/lib/youtube.js';

const consumers = [
  { script: resolve('scripts/generate-youtube-scripts.mjs'), category: 'scripts', directory: 'youtube-scripts', emptyExit: 1 },
  { script: resolve('scripts/generate-match-prompts.mjs'), category: 'image-prompts', directory: 'image-prompts', emptyExit: 0 },
];
const now = Date.now();
const stamp = offset => new Date(now + offset).toISOString();
const match = { id: 'provider-upcoming', webId: 'upcoming', home: 'Alpha', away: 'Beta', competition: 'nations', kickoff: stamp(3600_000), status: 'NS' };
const top = { version: 1, generatedAt: stamp(0), ranking: [{ id: match.webId }], extra: [] };
function persisted() {
  return { matchId: match.webId, home: match.home, away: match.away, competition: match.competition, kickoff: match.kickoff, description: 'Alpha y Beta. Consulta goatlab.win.', scripts: Array.from({ length: 10 }, (_, i) => ({ n: i + 1, title: 'Lectura del partido', hook: 'Alpha y Beta abren el análisis.', narration: 'Alpha y Beta abren el análisis. Consulta goatlab.win.', words: 10 })) };
}
async function fixture(t, consumer, topValue = top) {
  const cwd = await mkdtemp(join(tmpdir(), 'goatlab-generation-gates-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const data = join(cwd, 'public/data'), directory = join(data, consumer.directory);
  await mkdir(directory, { recursive: true });
  await writeFile(join(data, 'fixtures.json'), JSON.stringify({ matches: [match] }));
  if (topValue !== null) await writeFile(join(data, 'top.json'), typeof topValue === 'string' ? topValue : JSON.stringify(topValue));
  const run = (args = [], env = {}) => new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [consumer.script, ...(consumer.category === 'scripts' ? [] : [`--category=${consumer.category}`]), ...args], { cwd, env: { ...process.env, SCRIPT_PROVIDER_ORDER: 'UNCONFIGURED_GATE_TEST_MODEL', ...env } });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', status => resolveRun({ status, stdout, stderr }));
  });
  return { cwd, data, directory, run };
}

for (const consumer of consumers) {
  test(`${consumer.category}: invalid top rejects automatic and manual runs before generation`, async t => {
    for (const [value, reason] of [[null, 'missing'], ['{broken', 'invalid'], [{ ...top, generatedAt: stamp(3600_000) }, 'future'], [{ ...top, version: 9 }, 'invalid']]) {
      const { run } = await fixture(t, consumer, value);
      for (const args of [[], ['--match=upcoming']]) {
        const result = await run(args);
        assert.equal(result.status, 2, result.stderr);
        assert.match(result.stderr, new RegExp(`top.json rechazado \\(${reason}\\)`));
        assert.doesNotMatch(result.stderr, /evaluation-report|SKILL.md|No hay proveedores/);
      }
    }
  });

  test(`${consumer.category}: stale top maintains terminal artifacts before rejecting`, async t => {
    const { data, directory, run } = await fixture(t, consumer, { ...top, generatedAt: stamp(-8 * 3600_000) });
    const finished = { ...match, id: 'provider-finished', webId: 'finished', kickoff: stamp(-5 * 3600_000), status: 'FT', homeScore: 1, awayScore: 0 };
    await writeFile(join(data, 'finished-at.json'), JSON.stringify({ version: 1, seen: { finished: stamp(-2 * 3600_000) }, snapshots: { finished: { ...finished, ids: [finished.id, finished.webId] } } }));
    await writeFile(join(directory, 'finished.json'), '{}');
    const result = await run();
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stdout, /poda finished.json/);
    assert.match(result.stderr, /rechazado \(stale\)/);
    assert.deepEqual(await readdir(directory), []);
  });

  test(`${consumer.category}: authoritative empty ranking does not select live fixtures`, async t => {
    const { run } = await fixture(t, consumer, { ...top, ranking: [] });
    const result = await run();
    assert.equal(result.status, consumer.emptyExit, result.stderr);
    assert.doesNotMatch(result.stderr, /evaluation-report|No hay proveedores/);
  });
}

test('scripts: manual ID bypasses only age and valid persisted scripts skip generation', async t => {
  const { directory, run } = await fixture(t, consumers[0], { ...top, generatedAt: stamp(-8 * 3600_000) });
  await writeFile(join(directory, 'upcoming.json'), JSON.stringify(persisted()));
  const automatic = await run();
  assert.equal(automatic.status, 2);
  const manual = await run(['--match=provider-upcoming']);
  assert.equal(manual.status, 0, manual.stderr);
  assert.match(manual.stdout, /1 ya redactados, 0 faltantes/);
});

async function model(t, content) {
  let calls = 0;
  const server = createServer((request, response) => {
    calls += 1;
    request.resume();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => new Promise(resolveClose => server.close(resolveClose)));
  return { calls: () => calls, env: { SCRIPT_PROVIDER_ORDER: 'MISTRAL_MODEL', MISTRAL_API_KEY: 'test-only', MISTRAL_BASE_URL: `http://127.0.0.1:${server.address().port}/v1` } };
}
async function scriptGuide({ cwd, data }) {
  await writeFile(join(data, 'evaluation-report.json'), JSON.stringify({ published: false }));
  const skill = join(cwd, '.agents/skills/redactar-guiones-shorts');
  await mkdir(skill, { recursive: true });
  await writeFile(join(skill, 'SKILL.md'), 'Redacta diez guiones del partido.');
}
function draft() {
  const phrases = ['abren el análisis', 'comparan sus ritmos', 'buscan continuidad', 'presentan sus fortalezas', 'preparan el encuentro', 'muestran sus contrastes', 'exploran el contexto', 'ponen a prueba su lectura', 'conservan sus matices', 'cierran la previa'];
  return { lede: 'Alpha y Beta presentan un contraste de ritmos antes del cruce.', scripts: phrases.map(phrase => {
    const hook = `Alpha y Beta ${phrase}.`;
    return { hook, narration: `${hook} Los antecedentes aportan contexto y ayudan a explicar las tendencias de cada equipo. La información disponible conserva sus límites y el análisis espera los datos con calma. La previa se cuenta sin prisa y con la muestra por delante. La tensión del cruce sostiene la espera. Consulta la lectura completa en goatlab.win.` };
  }) };
}
test('scripts: unreadable, incomplete and mismatched stored scripts are regenerated atomically', async t => {
  const service = await model(t, draft());
  for (const old of ['{broken', JSON.stringify({ ...persisted(), scripts: [] }), JSON.stringify({ ...persisted(), home: 'Gamma' })]) {
    const f = await fixture(t, consumers[0]);
    await scriptGuide(f);
    const file = join(f.directory, 'upcoming.json');
    await writeFile(file, old);
    const before = service.calls();
    const result = await f.run([], service.env);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(service.calls(), before + 1);
    assert.deepEqual(scriptStructureErrors(JSON.parse(await readFile(file, 'utf8')), { matchId: match.webId, match }), []);
    assert.deepEqual(await readdir(f.directory), ['upcoming.json']);
  }
});
test('scripts: rejected regeneration preserves the prior file without temporary residues', async t => {
  const service = await model(t, { scripts: [] });
  const f = await fixture(t, consumers[0]);
  await scriptGuide(f);
  const old = JSON.stringify({ ...persisted(), home: 'Gamma' });
  const file = join(f.directory, 'upcoming.json');
  await writeFile(file, old);
  const result = await f.run([], service.env);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(service.calls(), 1);
  assert.equal(await readFile(file, 'utf8'), old);
  assert.deepEqual(await readdir(f.directory), ['upcoming.json']);
});
test('scripts: probability file feeds calc-backed picks into the saved draft', async t => {
  const probMatch = { ...match, lastMatches: { home: [{ date: '2026-09-01', home: 'Alpha', away: 'X', homeScore: 2, awayScore: 0 }], away: [] } };
  const prob = { markets: { oneX2: { home: 0.6, draw: 0.25, away: 0.15 }, exactScores: [{ home: 2, away: 0, p: 0.2 }] } };
  const facts = scriptFacts(probMatch, null, prob);
  assert.ok(facts.picks.every(pick => pick));
  const content = {
    lede: 'Alpha recibe a Beta con la serie reciente a la vista.',
    scripts: facts.picks.map((pick, i) => {
      const hook = `Alpha y Beta abren el análisis número ${['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'][i]}.`;
      return { hook, narration: `${hook} ${pick.bridge} ${pick.antecedent}. El ritmo del cruce sostiene la tensión hasta el final del partido y nadie se guarda nada esta noche cuando el ambiente aprieta. ${pick.noun} se queda con ${pick.verdict}. ${pick.call}` };
    }),
  };
  const service = await model(t, content);
  const f = await fixture(t, consumers[0]);
  await scriptGuide(f);
  await writeFile(join(f.data, 'fixtures.json'), JSON.stringify({ matches: [probMatch] }));
  await mkdir(join(f.cwd, 'public/match-probabilities'), { recursive: true });
  await writeFile(join(f.cwd, 'public/match-probabilities', `${probMatch.id}.json`), JSON.stringify(prob));
  const file = join(f.directory, 'upcoming.json');
  const result = await f.run([], service.env);
  assert.equal(result.status, 0, result.stderr);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(scriptStructureErrors(saved, { matchId: match.webId, match: probMatch }), []);
  assert.ok(saved.scripts.every(script => script.pick && script.pick.verdict.includes('la victoria de Alpha en casa')));
  assert.ok(saved.scripts[2].pick.verdict.includes('por 2'));
  assert.ok(saved.scripts[2].narration.includes(saved.scripts[2].pick.verdict));
});

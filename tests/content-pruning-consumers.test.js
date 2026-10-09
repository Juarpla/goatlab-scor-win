import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CONTENT_CATEGORIES, validateContent } from '../src/lib/match-content.js';

const scripts = [
  { category: 'scripts', directory: 'youtube-scripts', script: resolve('scripts/generate-youtube-scripts.mjs') },
  ...['image-prompts', 'video-prompts', 'motion-prompts'].map(category => ({ category, directory: category, script: resolve('scripts/generate-match-prompts.mjs') })),
];
const NOW = Date.now();
const stamp = offset => new Date(NOW + offset).toISOString();
function match(webId, status = 'FT', extra = {}) {
  return { id: `provider-${webId}`, webId, home: 'Alpha', away: 'Beta', competition: 'nations', kickoff: stamp(-5 * 3600_000), status, homeScore: 1, awayScore: 0, ...extra };
}
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function fixture(t, consumer, matches, ledger) {
  const cwd = await mkdtemp(join(tmpdir(), 'goatlab-content-pruning-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const data = join(cwd, 'public/data'), directory = join(data, consumer.directory);
  await mkdir(directory, { recursive: true });
  await writeFile(join(data, 'fixtures.json'), JSON.stringify({ matches }));
  await writeFile(join(data, 'top.json'), JSON.stringify({ version: 1, generatedAt: stamp(0), ranking: [{ id: 'unselected' }], extra: [] }));
  if (ledger !== undefined) await writeFile(join(data, 'finished-at.json'), typeof ledger === 'string' ? ledger : JSON.stringify(ledger));
  const run = (args = []) => spawnSync(process.execPath, [consumer.script, ...(consumer.category === 'scripts' ? [] : [`--category=${consumer.category}`]), ...args], { cwd, encoding: 'utf8', env: { ...process.env, SCRIPT_PROVIDER_ORDER: 'UNCONFIGURED_PRUNING_TEST_MODEL' } });
  return { cwd, data, directory, run };
}

for (const consumer of scripts) {
  test(`${consumer.category}: maintenance prunes only proven terminal artifacts before an empty partial batch exits`, async t => {
    const due = match('due'), grace = match('grace'), absent = match('absent');
    const retained = [grace, match('ns', 'NS', { kickoff: stamp(3600_000) }), match('live', '1H'), match('postponed', 'PST'), match('cancelled', 'CANC'), match('no-score', 'FT', { homeScore: null })];
    const all = [due, ...retained];
    const ledger = { version: 1, seen: Object.fromEntries([...all, absent].map(m => [m.webId, stamp(m.webId === 'grace' ? -30 * 60_000 : -2 * 3600_000)])), snapshots: Object.fromEntries([...all, absent].map(m => [m.webId, { ...m, ids: [m.id, m.webId] }])) };
    const { directory, run } = await fixture(t, consumer, all, ledger);
    for (const name of [...all.map(m => m.webId), 'absent', 'unknown', '_agnes-hourly']) await writeFile(join(directory, `${name}.json`), '{}');
    const result = run(['--limit=1', '--force']);
    assert.equal(result.error, undefined);
    assert.equal(await exists(join(directory, 'due.json')), false);
    assert.equal(await exists(join(directory, 'absent.json')), false);
    for (const name of [...retained.map(m => m.webId), 'unknown', '_agnes-hourly']) assert.equal(await exists(join(directory, `${name}.json`)), true, name);
    assert.match(result.stdout, /poda due\.json/);
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|ENOENT|No hay proveedores/);
  });

  test(`${consumer.category}: missing or corrupt finish ledger preserves existing artifacts`, async t => {
    for (const ledger of [undefined, '{broken', { version: 1, seen: { due: stamp(-2 * 3600_000) }, snapshots: [] }]) {
      const { directory, run } = await fixture(t, consumer, [match('due')], ledger);
      await writeFile(join(directory, 'due.json'), '{}');
      run();
      assert.equal(await exists(join(directory, 'due.json')), true);
    }
  });
}

function validPrompts(category, matchId) {
  const kinds = CONTENT_CATEGORIES[category].kinds;
  const prompts = kinds.map((kind, index) => ({
    n: index + 1, kind, title: kind,
    ...(category === 'motion-prompts' ? { factIds: [], presentations: ['editorial', 'statistical'],
      beats: [{ t0: 0, t1: 1.5, action: 'entry', detail: 'in' }, { t0: 1.5, t1: 4.5, action: 'build', detail: 'build' }, { t0: 4.5, t1: 7.5, action: 'main', detail: 'main' }, { t0: 7.5, t1: 9.5, action: 'exit', detail: 'out' }],
      easing: { enter: 'ease-out', curve: 'cubic-bezier(0.23,1,0.32,1)', exit: 'ease-out' },
      background: { variant: 'carbon-grain', base: '#101412', texture: 'grain', safeArea: 'left64 right64 top120 bottom480' },
      motion: { spring: { damping: 22, stiffness: 180, mass: 0.6 }, countUp: true, staggerMs: 60, scaleFrom: 0.95 },
      camera: { move: 'push-in 1.0 to 0.9 + drift', tilt: '0deg' },
      transition: { in: 'wipe', editorialToStatistical: 'dissolve', out: 'collapse' },
      emphasis_words: ['CLAVE'],
      motionSystem: 'carbon-v1',
      signature_move: 'stagger-reveal' } : {}),
    prompt: category === 'image-prompts'
      ? `Referential photorealistic illustration of Alpha and Beta football teams in realistic uniforms, vertical 9:16. ${kind} Stadium, supporters, flags and team crests. ${'Natural lighting and realistic anatomy. '.repeat(5)}`
      : category === 'video-prompts'
        ? `A 6-second camera movement for the reference image, vertical 9:16. ${kind}. ${'Maintain the original realistic scene and consistent lighting. '.repeat(5)}`
        : `Vertical 9:16 Spanish source sample transition ${kind}. ${'Detailed editorial and statistical composition with timing and readable labels. '.repeat(18)}`,
  }));
  const data = { version: 2, category, matchId, home: 'Alpha', away: 'Beta', competition: 'nations', kickoff: match(matchId).kickoff, prompts };
  assert.equal(validateContent(data, category, matchId), true);
  return data;
}

for (const consumer of scripts) {
  test(`${consumer.category}: manual provider alias protects canonical and alias files while maintenance continues`, async t => {
    const requested = match('manual'), other = match('other');
    const ledger = { version: 1, seen: { manual: stamp(-2 * 3600_000), other: stamp(-2 * 3600_000) }, snapshots: Object.fromEntries([requested, other].map(m => [m.webId, { ...m, ids: [m.id, m.webId] }])) };
    const { cwd, data, directory, run } = await fixture(t, consumer, [requested, other], ledger);
    await writeFile(join(directory, 'manual.json'), consumer.category === 'scripts' ? '{}' : JSON.stringify(validPrompts(consumer.category, 'manual')));
    await writeFile(join(directory, 'provider-manual.json'), '{}');
    await writeFile(join(directory, 'other.json'), '{}');
    if (consumer.category !== 'scripts') {
      await writeFile(join(data, 'evaluation-report.json'), JSON.stringify({ published: false }));
      await mkdir(join(cwd, 'scripts/prompts'), { recursive: true });
      await writeFile(join(cwd, `scripts/prompts/${consumer.category}.md`), 'Test guide');
    }
    const result = run(['--match=provider-manual']);
    assert.equal(await exists(join(directory, 'manual.json')), true);
    assert.equal(await exists(join(directory, 'provider-manual.json')), true);
    assert.equal(await exists(join(directory, 'other.json')), false);
    assert.deepEqual(JSON.parse(await readFile(join(data, 'top.json'), 'utf8')).extra, ['manual']);
    if (consumer.category !== 'scripts') {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /manual ya existe/);
    }
  });
}

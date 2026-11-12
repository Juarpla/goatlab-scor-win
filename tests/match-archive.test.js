import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { persistPrunedAnalyses } from '../actions/1-update-data/update-data.mjs';
import { updateMatchArchive } from '../src/lib/match-archive.js';
import { describeMatch } from '../src/lib/match-seo.js';
import { buildPruneContext, observeFinishedMatches } from '../src/lib/pruning.js';

const match = {
  id: 'af-12', webId: 'chelsea-vs-tottenham-2026-10-24', home: 'Chelsea FC', away: 'Tottenham Hotspur FC',
  competition: 'premier', kickoff: '2026-10-25T01:00:00Z', status: 'FT', homeScore: 0, awayScore: 2,
};
const reading = {
  inputKey: `v3|M|${match.id}|${match.home}|${match.away}|${match.competition}|${match.kickoff}|NS\nR|2026-10-17|Chelsea FC|Everton FC|2|0`,
  summary: [{ kind: 'forma', title: 'La forma reciente', bullets: ['Chelsea ganó 2–0 ante Everton.', 'Tottenham llega con menos descanso.'] }],
  review: { flag: false },
  generatedAt: '2026-10-24T12:00:00Z',
};
const now = Date.parse('2026-10-25T05:00:00Z');

test('confirmed matches keep their analysis and slug even after operational data is purged', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'goatlab-match-archive-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'llm-analysis.json');
  const archivePath = join(directory, 'match-archive.json');
  const ledger = observeFinishedMatches(null, [match], now - 7_200_000);
  const context = buildPruneContext([], ledger);
  assert.deepEqual(await persistPrunedAnalyses({ [match.id]: reading }, context, { now, path }), {});
  const saved = JSON.parse(await readFile(archivePath, 'utf8'));
  assert.equal(saved[match.webId].awayScore, 2);
  assert.equal(saved[match.webId].reading.summary[0].title, 'La forma reciente');
  assert.equal(saved[match.webId].reading.inputKey, undefined);
  await persistPrunedAnalyses({}, buildPruneContext(), { now: now + 8 * 86_400_000, path });
  assert.deepEqual(JSON.parse(await readFile(archivePath, 'utf8')), saved);

  const corrected = { ...match, awayScore: 1 };
  await persistPrunedAnalyses({}, buildPruneContext([corrected]), { now, path });
  assert.equal(JSON.parse(await readFile(archivePath, 'utf8'))[match.webId].awayScore, 1);

  await writeFile(archivePath, '{');
  await assert.rejects(persistPrunedAnalyses({ [match.id]: reading }, context, { now, path }), SyntaxError);
  assert.equal(await readFile(archivePath, 'utf8'), '{');
});

test('archive skips provisional scores, late or flagged analysis and mismatched identities', () => {
  const provisional = { ...match, status: 'NS' };
  assert.deepEqual(updateMatchArchive({}, { [match.id]: reading }, buildPruneContext([provisional]), { activeMatches: [provisional], now }), {});
  for (const entry of [
    { ...reading, review: { flag: true } },
    { ...reading, generatedAt: '2026-10-25T03:00:00Z' },
    { ...reading, inputKey: reading.inputKey.replace(match.away, 'Everton FC') },
    { ...reading, inputKey: reading.inputKey.split('\n')[0] },
  ]) {
    assert.deepEqual(updateMatchArchive({}, { [match.id]: entry }, buildPruneContext([match]), { now }), {});
  }
});

test('match descriptions show the Lima date, and use only available form, xG or a confirmed score', () => {
  const fixture = { ...match, competition: 'Premier League' };
  assert.match(describeMatch({ ...fixture, form: { home: { wins: 1, played: 3 }, away: { wins: 0, played: 5 } } }),
    /Premier League · 24 de octubre de 2026\. Forma previa: 1 victoria en 3 del local y 0 victorias en 5 del visitante\./);
  assert.match(describeMatch({ ...fixture, xg: { home: 0, away: 1.25 } }), /xG estimado: 0,00 para el local y 1,25 para el visitante/);
  assert.match(describeMatch({ ...fixture, finalScore: { home: 0, away: 2 } }), /Marcador final: 0–2/);
  assert.match(describeMatch(fixture), /Calendario y contexto del encuentro/);
});

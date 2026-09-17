import test from 'node:test';
import assert from 'node:assert/strict';
import { mapBroadcasts, mapSocial, mapReferee, fetchEventBroadcasts, fetchEventSocial, fetchEventReferee, LATAM_COUNTRIES } from '../src/lib/bzzoiro.js';

test('mapBroadcasts keeps Latam channels and drops the rest', () => {
  const rows = mapBroadcasts({ results: [
    { channel_name: 'ESPN', country_code: 'AR' },
    { channel_name: 'DAZN', country_code: 'GB' },
    { channel_name: 'Win Sports', country_code: 'CO' },
    { name: null, country_code: 'MX' },
  ] });
  assert.deepEqual(rows, [
    { channel: 'ESPN', country: 'AR' },
    { channel: 'Win Sports', country: 'CO' },
  ]);
  assert.ok(LATAM_COUNTRIES.includes('PE'));
});

test('mapSocial keeps only posts with text and url, max 3', () => {
  const rows = mapSocial({ results: [
    { account: '@club', text: 'Once confirmado', url: 'https://x.com/1', published_at: '2026-09-17' },
    { account: '@club', text: 'Sin enlace' },
    { account: '@a', text: 't2', url: 'https://x.com/2' },
    { account: '@b', text: 't3', url: 'https://x.com/3' },
    { account: '@c', text: 't4', url: 'https://x.com/4' },
  ] });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].account, '@club');
});

test('fetchEventBroadcasts/Social call one endpoint each and degrade to null', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.includes('/broadcasts/')) return new Response(JSON.stringify({ results: [{ channel_name: 'ESPN', country_code: 'AR' }] }), { status: 200 });
    if (url.includes('/social/')) return new Response(JSON.stringify({ results: [] }), { status: 200 });
    return new Response('', { status: 404 });
  };
  const env = { BZZOIRO_API_TOKEN: 't' };
  assert.deepEqual(await fetchEventBroadcasts(601246, env, fetchImpl), [{ channel: 'ESPN', country: 'AR' }]);
  assert.equal(await fetchEventSocial(601246, env, fetchImpl), null);
  assert.deepEqual(calls.filter(u => u.includes('/broadcasts/')).length, 1);
  assert.equal(await fetchEventBroadcasts(null, env, fetchImpl), null);
  assert.equal(await fetchEventBroadcasts(1, {}, fetchImpl), null);
});

test('mapReferee keeps name and per-match averages, null when unusable', () => {
  assert.deepEqual(
    mapReferee({ name: 'M. Oliver', avg_yellow_cards: 3.4, avg_red_cards: 0.2, avg_fouls: 21.5, matches: 18 }),
    { name: 'M. Oliver', avgYellow: 3.4, avgRed: 0.2, avgFouls: 21.5, matches: 18 },
  );
  assert.equal(mapReferee({ name: 'Sin datos' }), null);
  assert.equal(mapReferee({ avg_yellow_cards: 3 }), null);
  assert.equal(mapReferee(null), null);
});

test('fetchEventReferee resolves referee_id then the card averages', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.endsWith('/events/601246/')) return new Response(JSON.stringify({ id: 601246, referee_id: 77 }), { status: 200 });
    if (url.includes('/referees/77/')) return new Response(JSON.stringify({ name: 'C. Turpin', avg_yellow_cards: 4.1, avg_red_cards: 0.3, avg_fouls: 24, matches: 12 }), { status: 200 });
    return new Response('', { status: 404 });
  };
  const env = { BZZOIRO_API_TOKEN: 't' };
  const referee = await fetchEventReferee(601246, env, fetchImpl);
  assert.equal(referee?.name, 'C. Turpin');
  assert.equal(referee?.avgYellow, 4.1);
  assert.equal(calls.length, 2);
  const noRef = await fetchEventReferee(9, env, async () => new Response(JSON.stringify({ id: 9 }), { status: 200 }));
  assert.equal(noRef, null);
});

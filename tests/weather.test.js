import test from 'node:test';
import assert from 'node:assert/strict';
import { kickoffHour, sampleHourlyAt, fetchKickoffWeather } from '../src/lib/weather.js';

test('kickoffHour truncates to the indexed hour, null on garbage', () => {
  assert.equal(kickoffHour('2026-09-20T19:30:00Z'), '2026-09-20T19:00');
  assert.equal(kickoffHour(null), null);
  assert.equal(kickoffHour('mañana'), null);
});

test('sampleHourlyAt picks the kickoff hour, null when the hour is missing', () => {
  const hourly = {
    time: ['2026-09-20T18:00', '2026-09-20T19:00'],
    temperature_2m: [20.1, 19.4], precipitation: [0, 0.2], weathercode: [1, 61], wind_speed_10m: [10, 14],
  };
  const sample = sampleHourlyAt(hourly, '2026-09-20T19:30:00Z');
  assert.deepEqual(sample, { temp: 19.4, precipitation: 0.2, weathercode: 61, wind: 14, sampledAt: '2026-09-20T19:00' });
  assert.equal(sampleHourlyAt(hourly, '2026-09-21T19:30:00Z'), null);
  assert.equal(sampleHourlyAt(null, '2026-09-20T19:30:00Z'), null);
});

test('fetchKickoffWeather batches future coords in one forecast call', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    return new Response(JSON.stringify([{
      hourly: {
        time: ['2026-09-20T19:00'],
        temperature_2m: [19.4], precipitation: [0.2], weathercode: [61], wind_speed_10m: [14],
      },
    }, {
      hourly: {
        time: ['2026-09-20T19:00'],
        temperature_2m: [22.0], precipitation: [0], weathercode: [1], wind_speed_10m: [9],
      },
    }]), { status: 200 });
  };
  const out = await fetchKickoffWeather([
    { key: 'a', lat: 40.45, lng: -3.68, kickoff: '2026-09-20T19:30:00Z' },
    { key: 'b', lat: 41.38, lng: 2.12, kickoff: '2026-09-20T19:30:00Z' },
  ], { fetchImpl, today: '2026-09-16' });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('api.open-meteo.com/v1/forecast'));
  assert.ok(calls[0].includes('latitude=40.45%2C41.38') || calls[0].includes('latitude=40.45,41.38'));
  assert.equal(out.a.source, 'open-meteo-forecast');
  assert.equal(out.b.temp, 22.0);
});

test('fetchKickoffWeather uses the archive per past date and skips garbage', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    return new Response(JSON.stringify({
      hourly: {
        time: ['2026-09-10T19:00'],
        temperature_2m: [18.0], precipitation: [1.1], weathercode: [80], wind_speed_10m: [11],
      },
    }), { status: 200 });
  };
  const out = await fetchKickoffWeather([
    { key: 'past', lat: 40.45, lng: -3.68, kickoff: '2026-09-10T19:30:00Z' },
    { key: 'nope', lat: null, lng: null, kickoff: '2026-09-10T19:30:00Z' },
  ], { fetchImpl, today: '2026-09-16' });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('archive-api.open-meteo.com'));
  assert.equal(out.past.source, 'open-meteo-archive');
  assert.equal(out.nope, undefined);
});

// Word timings for the voice: Mistral, then local whisper.cpp.
// Each provider returns [{word, start, end}] in seconds. If one fails,
// takes too long or hears nothing, it moves to the next. The final text
// comes from the script (video-render/contract/timing.js); only timings matter here.
import { execFile } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TIMEOUT_MS = 45_000;

function valid(words) {
  return (words ?? []).filter(w => w.word && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start);
}

/** With `word` granularity, Voxtral sends one segment per word. */
export function parseMistral(json) {
  if (json?.words?.length) {
    return valid(json.words.map(w => ({ word: String(w.word ?? w.text ?? '').trim(), start: Number(w.start), end: Number(w.end) })));
  }
  const out = [];
  for (const s of json?.segments ?? []) {
    if (s.words?.length) {
      for (const w of s.words) out.push({ word: String(w.word ?? w.text ?? '').trim(), start: Number(w.start), end: Number(w.end) });
      continue;
    }
    const parts = String(s.text ?? '').split(/\s+/).filter(Boolean);
    const span = (Number(s.end) - Number(s.start)) / Math.max(1, parts.length);
    parts.forEach((word, i) => out.push({ word, start: Number(s.start) + i * span, end: Number(s.start) + (i + 1) * span }));
  }
  return valid(out);
}

/** whisper.cpp with `-ml 1 -sow -ojf`: one segment per word, offsets in ms. */
export function parseWhisperCpp(json) {
  return valid((json?.transcription ?? []).map(s => ({
    word: String(s.text ?? '').trim(),
    start: Number(s.offsets?.from) / 1000,
    end: Number(s.offsets?.to) / 1000,
  })).filter(w => w.word && !/^\[.*\]$/.test(w.word)));
}

async function withTimeout(fetchImpl, url, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetchImpl(url, { ...init, signal: ctrl.signal });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 160)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

// `language` and `timestamp_granularities` cannot be combined in Mistral.
export async function mistral({ flac, env, fetchImpl }) {
  const key = env.MISTRAL_API_KEY;
  if (!key) throw new Error('sin MISTRAL_API_KEY');
  const base = (env.MISTRAL_BASE_URL ?? 'https://api.mistral.ai/v1').replace(/\/$/, '');
  const form = new FormData();
  form.set('model', env.MISTRAL_STT_MODEL ?? 'voxtral-mini-latest');
  form.set('file', new Blob([readFileSync(flac)], { type: 'audio/flac' }), 'voice.flac');
  form.set('timestamp_granularities', 'word');
  const json = await withTimeout(fetchImpl, `${base}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
  return parseMistral(json);
}

export async function whisperLocal({ wav, env, runImpl = run }) {
  const bin = env.WHISPER_BIN ?? 'whisper-cli';
  const model = env.WHISPER_MODEL ?? '/opt/whisper/ggml-base.bin';
  if (!existsSync(model)) throw new Error(`falta el modelo ${model}`);
  if (/\.en\.bin$/.test(model)) throw new Error('modelo .en: traduciría la voz en español');
  const outBase = wav.replace(/\.wav$/, '-whisper');
  await runImpl(bin, ['-m', model, '-l', 'es', '-ml', '1', '-sow', '-ojf', '-of', outBase, '-np', wav], {
    timeout: 5 * 60 * 1000,
  });
  return parseWhisperCpp(JSON.parse(readFileSync(`${outBase}.json`, 'utf8')));
}

export const PROVIDERS = [
  ['mistral', mistral],
  ['whisper.cpp', whisperLocal],
];

/**
 * Tries each provider in order. Returns {provider, words, errors};
 * `provider` is null if none heard words.
 */
export async function transcribeWords({
  flac,
  wav,
  voiceSeconds,
  env = process.env,
  fetchImpl = fetch,
  runImpl = run,
  providers = PROVIDERS,
  log = () => {},
}) {
  const errors = [];
  for (const [name, fn] of providers) {
    try {
      const words = await fn({ flac, wav, voiceSeconds, env, fetchImpl, runImpl });
      if (!words.length) throw new Error('sin palabras');
      return { provider: name, words, errors };
    } catch (e) {
      const msg = `${name}: ${String(e.message ?? e).slice(0, 200)}`;
      errors.push(msg);
      log(msg);
    }
  }
  return { provider: null, words: [], errors };
}

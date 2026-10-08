/** Prepare a conservative Agnes cutover seed. This command never writes to R2. */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const digest = value => createHash('sha256').update(String(value)).digest('hex');
const UNKNOWN_PROMPT = digest('agnes:legacy-prompt-unknown');

/** Collect only documented match identity fields, including provider aliases. */
export function legacyMatchIds(documents = [], sqlite = {}) {
  const ids = new Set();
  const add = value => { if (typeof value === 'string' && ID.test(value)) ids.add(value); };
  const match = value => {
    if (!value || typeof value !== 'object') return;
    if (value.ids !== undefined && !Array.isArray(value.ids)) throw new Error('Aliases legados inválidos');
    for (const name of ['matchId', 'webId', 'id', 'providerId']) add(value[name]);
    for (const alias of value.ids ?? []) add(alias);
  };
  for (const document of documents) {
    if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Documento de identidad legado inválido');
    for (const name of ['matches', 'ranking', 'extra']) if (document[name] !== undefined && !Array.isArray(document[name])) throw new Error('Documento de identidad legado inválido');
    for (const name of ['seen', 'snapshots']) if (document[name] !== undefined && (!document[name] || typeof document[name] !== 'object' || Array.isArray(document[name]))) throw new Error('Documento de identidad legado inválido');
    match(document);
    for (const category of ['scripts', 'image-prompts', 'video-prompts', 'motion-prompts']) {
      match(document?.[category]);
      match(document?.content?.[category]);
    }
    for (const item of document?.matches ?? []) match(item);
    for (const item of document?.ranking ?? []) match(item);
    for (const id of document?.extra ?? []) add(id);
    for (const id of Object.keys(document?.seen ?? {})) add(id);
    for (const [id, item] of Object.entries(document?.snapshots ?? {})) { add(id); match(item); }
  }
  for (const name of ['images', 'matches', 'video_tasks', 'video_models']) {
    for (const row of sqlite[name] ?? []) add(row.match_id);
  }
  return [...ids].sort();
}

function parseSaved(value) {
  if (typeof value !== 'string') return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}

/** Import hashes and provider task IDs, never raw prompts, URLs or diagnostics. */
export function legacySlots(sqlite = {}, { nowMs = Date.now() } = {}) {
  const expiration = new Map();
  for (const row of sqlite.matches ?? []) expiration.set(row.match_id, Math.max(expiration.get(row.match_id) || 0, Number(row.expires) * 1000 || 0));
  const models = new Map();
  for (const row of sqlite.video_models ?? []) {
    const key = `${row.match_id}:${row.ordinal}`;
    if (models.has(key) && models.get(key) !== row.model) throw new Error(`Modelo SQLite contradictorio: ${key}`);
    models.set(key, row.model);
  }
  const rows = [];
  for (const kind of ['image', 'video']) {
    for (const row of sqlite[kind === 'image' ? 'images' : 'video_tasks'] ?? []) {
      const ordinal = Number(kind === 'image' ? row.slot : row.ordinal);
      if (!ID.test(String(row.match_id ?? '')) || !Number.isInteger(ordinal) || ordinal < 0 || ordinal > (kind === 'image' ? 3 : 4)) throw new Error('Identidad de slot SQLite inválida');
      const saved = parseSaved(row.result);
      const prompt = kind === 'video' ? row.prompt : saved.prompt;
      const rawExpires = kind === 'video' ? Number(row.expires) * 1000 : expiration.get(row.match_id);
      const expiresAtMs = Number.isFinite(rawExpires) && rawExpires > 0 ? rawExpires : nowMs + 86400_000;
      const state = ['done', 'used'].includes(row.status) ? 'completed' : row.status === 'pending' && kind === 'video' && row.video_id ? 'pending' : 'uncertain';
      const item = {
        matchId: row.match_id, kind, ordinal,
        promptHash: typeof prompt === 'string' && prompt ? digest(prompt) : UNKNOWN_PROMPT,
        model: String(saved.model || models.get(`${row.match_id}:${ordinal}`) || `agnes-${kind}-2.5-flash`),
        state, expiresAtMs,
      };
      if (kind === 'video' && typeof row.reference === 'string' && row.reference) item.referenceHash = digest(row.reference);
      if (kind === 'video' && typeof row.video_id === 'string' && row.video_id && !/[\s?]/.test(row.video_id) && !/^https?:/i.test(row.video_id)) item.videoId = row.video_id;
      rows.push(item);
    }
  }
  const unique = new Map();
  const priority = { completed: 0, pending: 1, uncertain: 2 };
  for (const item of rows) {
    const key = `${item.matchId}:${item.kind}:${item.ordinal}`;
    const previous = unique.get(key);
    if (!previous) { unique.set(key, item); continue; }
    for (const field of ['promptHash', 'model', 'referenceHash', 'videoId']) {
      if (previous[field] != null && item[field] != null && previous[field] !== item[field]) throw new Error(`Evidencia SQLite contradictoria: ${key}`);
    }
    unique.set(key, {
      ...previous, ...item,
      expiresAtMs: Math.max(previous.expiresAtMs, item.expiresAtMs),
      state: priority[previous.state] > priority[item.state] ? previous.state : item.state,
    });
  }
  return [...unique.values()];
}

const SQLITE_READER = `
import json, pathlib, sqlite3, sys
path = pathlib.Path(sys.argv[1]).resolve()
with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True) as db:
    db.row_factory = sqlite3.Row
    names = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    output = {}
    columns = {
        'matches': ['match_id', 'expires'],
        'images': ['match_id', 'slot', 'status', 'result'],
        'video_tasks': ['match_id', 'ordinal', 'status', 'video_id', 'prompt', 'reference', 'expires', 'result'],
        'video_models': ['match_id', 'ordinal', 'model'],
        'quota_use': ['day', 'images', 'video_seconds'],
    }
    for table, fields in columns.items():
        if table not in names: continue
        present = {row[1] for row in db.execute('PRAGMA table_info(' + table + ')')}
        selected = [field for field in fields if field in present]
        if 'match_id' not in present and table != 'quota_use': raise ValueError('legacy schema missing match_id')
        output[table] = [dict(row) for row in db.execute('SELECT ' + ','.join(selected) + ' FROM ' + table)]
    print(json.dumps(output))
`;

export async function readLegacySqlite(path, { python = process.env.PYTHON_BIN || 'python3' } = {}) {
  try {
    const { stdout } = await run(python, ['-c', SQLITE_READER, resolve(path)], { maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch { throw new Error('No se pudo leer el SQLite legado en modo de solo lectura'); }
}

async function readJson(path, optional = false) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Documento inválido');
    return value;
  }
  catch (error) {
    if (optional && error.code === 'ENOENT') return null;
    throw new Error(`JSON legado ilegible: ${path}`);
  }
}

/** Read all local identity evidence; malformed present files abort preparation. */
export async function collectLegacy({ repo = '.', sqlitePaths = [], snapshots = [], nowMs = Date.now() } = {}) {
  const documents = [];
  const syntheticIds = [];
  const data = join(repo, 'public/data');
  for (const name of ['fixtures.json', 'calendar.json', 'top.json', 'finished-at.json']) {
    const document = await readJson(join(data, name), true);
    if (document) documents.push(document);
  }
  for (const category of ['youtube-scripts', 'image-prompts', 'video-prompts', 'motion-prompts', 'media-pack']) {
    let names;
    try { names = await readdir(join(data, category)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const name of names) {
      if (!/\.(json|ready|running)$/.test(name)) continue;
      const id = name.replace(/(?:\.(?:progress|content))?\.(?:json|ready|running)$/, '');
      if (!ID.test(id)) continue;
      syntheticIds.push({ matchId: id });
      if (name.endsWith('.json')) documents.push(await readJson(join(data, category, name)));
    }
  }
  try {
    for (const item of await readdir(join(data, 'media-pack/gen'), { withFileTypes: true })) {
      if (item.isDirectory() && ID.test(item.name)) syntheticIds.push({ matchId: item.name });
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const path of snapshots) documents.push(await readJson(path));
  const databases = await Promise.all(sqlitePaths.map(path => readLegacySqlite(path)));
  const sqlite = {};
  for (const database of databases) for (const [table, rows] of Object.entries(database)) sqlite[table] = [...(sqlite[table] ?? []), ...rows];
  const slots = legacySlots(sqlite, { nowMs });
  return { legacyMatchIds: legacyMatchIds([...documents, ...syntheticIds], sqlite), legacySlots: slots, sqliteSources: databases.length };
}

export function preparationSummary(collected, { nowMs = Date.now() } = {}) {
  const states = { completed: 0, pending: 0, uncertain: 0 };
  for (const slot of collected.legacySlots) states[slot.state]++;
  return { mode: 'prepare-only', dayUTC: new Date(nowMs).toISOString().slice(0, 10), legacyMatches: collected.legacyMatchIds.length, legacySlots: collected.legacySlots.length, states, sqliteSources: collected.sqliteSources, conservativeQuota: true };
}

export async function writePrivateSeed(path, seed, { repo = '.' } = {}) {
  const requested = resolve(path), root = await realpath(resolve(repo));
  const allowed = target => {
    const inside = relative(root, target);
    if (!inside.startsWith(`..${sep}`) && inside !== '..' && !inside.startsWith(`.cache${sep}`)) throw new Error('El seed privado debe guardarse fuera del repo o dentro de .cache/');
  };
  allowed(requested);
  await mkdir(dirname(requested), { recursive: true, mode: 0o700 });
  const target = join(await realpath(dirname(requested)), basename(requested));
  allowed(target);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify({ seed }), { mode: 0o600, flag: 'wx' });
  try { await rename(temp, target); } finally { await rm(temp, { force: true }); }
}

async function main(args) {
  const options = { sqlitePaths: [], snapshots: [] };
  let output;
  for (const arg of args) {
    const split = arg.indexOf('='), key = split < 0 ? arg : arg.slice(0, split), value = split < 0 ? '' : arg.slice(split + 1);
    if (key === '--repo' && value) options.repo = value;
    else if (key === '--sqlite' && value) options.sqlitePaths.push(value);
    else if (key === '--snapshot' && value) options.snapshots.push(value);
    else if (key === '--out' && value) output = value;
    else throw new Error('Uso: bootstrap-agnes-state.mjs [--repo=PATH] [--sqlite=PATH] [--snapshot=PATH] [--out=PRIVATE_PATH]');
  }
  const nowMs = Date.now();
  const collected = await collectLegacy({ ...options, nowMs });
  if (output) {
    const { createAgnesState } = await import('../src/lib/agnes-state.js');
    await writePrivateSeed(output, createAgnesState({ ...collected, nowMs }), options);
  }
  console.log(JSON.stringify({ ...preparationSummary(collected, { nowMs }), seedWritten: Boolean(output) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 2; }
}

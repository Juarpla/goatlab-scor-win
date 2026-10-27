// Offline adapter for OpenClaw 2026.9.6 / agent schema 23. Never run a write
// sweep while OpenClaw (including its workers) is alive. The supervisor owns this.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, lstatSync, openSync, readSync, closeSync, readlinkSync, fsyncSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zstdDecompressSync, gunzipSync } from 'node:zlib';

export const TTL_MS = 72 * 60 * 60 * 1000;
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const time = value => {
  if (typeof value === 'string') value = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  return Number.isFinite(value) && value > 0 ? value : Infinity;
};
function files(root) {
  if (!existsSync(root)) return [];
  const result = [];
  for (const item of readdirSync(root, { withFileTypes: true })) {
    const file = join(root, item.name);
    if (item.isSymbolicLink()) throw new Error(`retention refuses symlink in history: ${file}`);
    if (item.isDirectory()) result.push(...files(file));
    else if (item.isFile()) result.push(file);
  }
  return result;
}
function decode(blob, encoding) {
  const bytes = Buffer.from(blob);
  if (encoding === 'zstd' || encoding === 'zst') return zstdDecompressSync(bytes, { maxOutputLength: 128 * 1024 * 1024 }).toString();
  if (encoding === 'gz') return gunzipSync(bytes, { maxOutputLength: 128 * 1024 * 1024 }).toString();
  return bytes.toString();
}
function header(text) {
  // The original session header owns birth, not an archive's publication time.
  const first = JSON.parse(text.split('\n', 1)[0]);
  return { id: first.id ?? first.sessionId, born: time(first.timestamp ?? first.createdAt), key: first.sessionKey };
}
function tables(db) {
  return new Map(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
    .map(({ name }) => [name, db.prepare(`PRAGMA table_info(${quote(name)})`).all().map(c => c.name)]));
}
function open(file, dryRun) {
  const db = new DatabaseSync(file, { readOnly: dryRun, timeout: 5000 });
  db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  if (!dryRun) db.exec('PRAGMA secure_delete=ON;');
  return db;
}
function finish(db) {
  // Rebuild FTS segments and the whole file: deleted text must not linger in free
  // pages or WAL. All writers are already dead; no replacement/archive is made.
  db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('retention foreign key check failed');
}
function remove(file) {
  if (existsSync(file)) {
    if (!lstatSync(file).isFile()) throw new Error('retention expected a regular history file');
    unlinkSync(file);
  }
}
function isSqlite(file) {
  const fd = openSync(file, 'r');
  try { const bytes = Buffer.alloc(16); readSync(fd, bytes, 0, 16, 0); return bytes.equals(Buffer.from('SQLite format 3\0')); }
  finally { closeSync(fd); }
}
function saveLedger(file, value) {
  const fd = openSync(file + '.tmp', 'w', 0o600);
  try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(file + '.tmp', file);
  const directory = openSync(resolve(file, '..'), 'r');
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
const privateAuxiliaryTables = new Set([
  'diagnostic_events', 'capture_sessions', 'capture_events', 'capture_blobs',
  'channel_ingress_events', 'gateway_restart_sentinel',
]);
// These are derived caches, not auth_profile_store/auth_profile_state. Clearing
// all derived memory avoids retaining paraphrases with incomplete old provenance.
const derivedTables = [
  'cache_entries', 'memory_index_chunks', 'memory_index_sources', 'memory_index_meta',
  'memory_entry_origins', 'memory_embedding_cache', 'memory_index_chunk_recall_metadata',
  'memory_index_chunk_provenance',
];
const referenceColumn = name => /(^|_)(session_id|session_key)$/.test(name)
  || ['current_session_id', 'spawned_by', 'owner_key', 'controller_id'].includes(name);

function assertNoOtherDatabaseOwner(root) {
  if (process.platform !== 'linux') return;
  const runtimeUid = process.geteuid();
  for (const pid of readdirSync('/proc').filter(p => /^\d+$/.test(p) && Number(p) !== process.pid)) {
    // The image runs the native runtime as the same unprivileged uid. Root's
    // Fly agent/SSH processes are outside this owner and their fds are private.
    // Uid lists real/effective/saved/filesystem IDs: sudo helpers can retain the
    // runner's real UID while running as root. Inspect the effective owner.
    let status;
    try { status = readFileSync(`/proc/${pid}/status`, 'utf8'); } catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) continue; throw error; }
    const uid = status.match(/^Uid:\s+\d+\s+(\d+)/m)?.[1];
    if (uid === undefined) throw new Error(`offline retention cannot identify process UID: ${pid}`);
    if (runtimeUid !== 0 && Number(uid) !== runtimeUid) continue;
    let fds;
    try { fds = readdirSync(`/proc/${pid}/fd`); } catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) continue; throw error; }
    for (const fd of fds) {
      let target;
      try { target = readlinkSync(`/proc/${pid}/fd/${fd}`); } catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) continue; throw error; }
      if (target.startsWith(root + '/') && (/\/openclaw-agent\.sqlite/.test(target) || target.includes('/state/openclaw.sqlite'))) {
        throw new Error('offline retention refused: another process still owns OpenClaw storage');
      }
    }
  }
}

/** Read-only planning is safe online. Mutation requires exclusive process ownership. */
export function sweep({ root = '/data', now = Date.now(), dryRun = false,
  workspaces = [], exclusive = false } = {}) {
  root = resolve(root);
  if (!Number.isFinite(now)) throw new Error('invalid retention clock');
  if (!dryRun && !exclusive) throw new Error('offline retention requires exclusive=true');
  if (!dryRun) assertNoOtherDatabaseOwner(root);
  const ledgerFile = join(root, '.conversation-retention.json');
  const ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : { version: 1, births: {}, sessions: {} };
  if (ledger.version !== 1 || !ledger.births || typeof ledger.births !== 'object') throw new Error('invalid retention birth ledger');
  ledger.sessions ??= {};
  const handles = [];
  const agents = [];
  const identities = new Map();
  const byId = new Map();
  const copies = [];
  const parents = [];
  const add = (agent, key, id, born) => {
    const identity = `${agent}\n${key || id}`;
    let row = identities.get(identity);
    if (!row) identities.set(identity, row = { identity, agent, key, ids: new Set(), born: time(ledger.births[identity]) });
    row.born = Math.min(row.born, time(born), time(ledger.sessions[`${agent}\n${id}`]));
    if (id) { row.ids.add(id); byId.set(`${agent}\n${id}`, row); }
    return row;
  };
  try {
    // Include retired agents as well as configured ones. Also inspect native
    // SQLite backup/repair copies in these directories, never GoatLab's own DBs.
    for (const file of files(join(root, 'agents')).filter(f => /^openclaw-agent\.sqlite(?:[.].*)?$/.test(basename(f))
      && !/(lock|writer)\.sqlite$/.test(f))) {
      if (!isSqlite(file)) continue;
      const agent = file.slice(join(root, 'agents').length + 1).split('/')[0];
      const db = open(file, dryRun); handles.push(db);
      const schema = tables(db);
      const meta = db.prepare('SELECT role,schema_version,app_version FROM schema_meta').all();
      if (!meta.some(r => r.role === 'agent' && r.schema_version === 23 && r.app_version === '2026.9.6')
        || !['created_at', 'session_id', 'session_key'].every(c => schema.get('session_windows')?.includes(c))) {
        throw new Error(`unsupported OpenClaw retention schema: ${file}`);
      }
      agents.push({ agent, file, db, schema });
      for (const row of db.prepare('SELECT session_key,current_session_id,created_at,parent_session_key,spawned_by,fork_source_session_key,fork_source_session_id FROM session_nodes').all()) {
        add(agent, row.session_key, row.current_session_id, row.created_at);
        parents.push({ child: `${agent}\n${row.session_key}`, refs: [row.parent_session_key, row.spawned_by, row.fork_source_session_key, row.fork_source_session_id].filter(Boolean) });
      }
      for (const row of db.prepare('SELECT session_key,session_id,created_at FROM session_windows').all()) {
        const birth = db.prepare('SELECT created_at FROM transcript_events WHERE session_id=? ORDER BY seq LIMIT 1').get(row.session_id)?.created_at;
        add(agent, row.session_key, row.session_id, Math.min(time(row.created_at), time(birth)));
      }
      for (const row of db.prepare('SELECT session_key,session_id,encoding,archive_blob,archive_name FROM session_transcript_archives').all()) {
        const known = byId.get(`${agent}\n${row.session_id}`);
        let born = known?.born;
        if (!Number.isFinite(born)) {
          try { born = header(decode(row.archive_blob, row.encoding)).born; } catch { born = 0; }
        }
        const owner = add(agent, row.session_key, row.session_id, born);
        copies.push({ owner, name: row.archive_name, agent });
      }
      for (const row of db.prepare('SELECT session_id,archive_name FROM session_transcript_cold_archives').all()) {
        const owner = byId.get(`${agent}\n${row.session_id}`);
        if (!owner) throw new Error('cold archive without a native session window');
        copies.push({ owner, name: row.archive_name, agent });
      }
    }
    for (const file of files(join(root, 'agents')).filter(f => /\.jsonl(?:\.|$)/.test(basename(f)))) {
      const agent = file.slice(join(root, 'agents').length + 1).split('/')[0];
      const fromName = basename(file).split('.jsonl', 1)[0];
      let owner = copies.find(copy => copy.agent === agent && copy.name === basename(file))?.owner
        || byId.get(`${agent}\n${fromName}`);
      if (!owner) {
        let h;
        try { h = header(decode(readFileSync(file), file.endsWith('.zst') ? 'zst' : file.endsWith('.gz') ? 'gz' : 'identity')); }
        catch { h = { id: fromName, born: 0 }; }
        owner = add(agent, h.key, h.id || fromName, h.born);
      }
      copies.push({ owner, file, agent });
    }
    // Unknown birth cannot be granted a fresh 72h on every boot. Treat it as
    // expired; this also covers legacy imported archives with missing headers.
    for (const row of identities.values()) if (!Number.isFinite(row.born)) row.born = 0;
    // Forks/children can contain a copy of their parent's transcript. They cannot
    // extend its retention simply by acquiring a new ID or moving to an agent.
    const byReference = new Map([...identities.values()].flatMap(row => [...row.ids, row.key].filter(Boolean).map(ref => [ref, row])));
    for (let pass = 0; pass < identities.size; pass++) {
      let changed = false;
      for (const link of parents) {
        const child = identities.get(link.child);
        for (const ref of link.refs) {
          const parent = byReference.get(ref);
          if (child && parent && child.born > parent.born) { child.born = parent.born; changed = true; }
        }
      }
      if (!changed) break;
    }
    const expired = [...identities.values()].filter(row => row.born + TTL_MS <= now);
    const alive = [...identities.values()].filter(row => row.born + TTL_MS > now);
    const expiredSet = new Set(expired);
    const result = { expiredConversations: expired.length, expiredGenerations: expired.reduce((n, r) => n + r.ids.size, 0),
      nextExpiry: alive.length ? Math.min(...alive.map(row => row.born + TTL_MS)) : null, agents: agents.length };
    if (dryRun) return result;
    // Persist the plan before deleting anything. A crash between DB and file
    // deletion must not turn a fresh archive timestamp into a new lifetime.
    for (const row of identities.values()) {
      ledger.births[row.identity] = row.born;
      for (const id of row.ids) ledger.sessions[`${row.agent}\n${id}`] = row.born;
    }
    saveLedger(ledgerFile, ledger);
    if (expired.length) {
      const refs = new Set(expired.flatMap(row => [...row.ids, row.key].filter(Boolean)));
      function purgeReferences(db, schema, isAgent) {
        db.exec('BEGIN IMMEDIATE');
        try {
          for (const [table, columns] of schema) {
            if (table.startsWith('sqlite_') || /_(data|idx|docsize|config|content)$/.test(table) && table.includes('fts')) continue;
            if (/auth|credential|config|identity_keys|device_|pairing|approval_standing/.test(table)) continue;
            if (['plugin_state_entries', 'plugin_blob_entries'].includes(table)) {
              db.exec(`DELETE FROM ${quote(table)} WHERE plugin_id IN ('memory-core','memory-lancedb','dreaming')`);
            }
            if (privateAuxiliaryTables.has(table) || isAgent && derivedTables.includes(table)) {
              db.exec(`DELETE FROM ${quote(table)}`); continue;
            }
            const referenceColumns = columns.filter(referenceColumn);
            for (const column of referenceColumns) {
              const statement = db.prepare(`DELETE FROM ${quote(table)} WHERE ${quote(column)}=?`);
              for (const ref of refs) statement.run(ref);
            }
            // Older shared-state envelopes sometimes contain only an embedded
            // session identity (e.g. a delivery origin), without a promoted key.
            if (!isAgent) for (const column of columns.filter(c => c.endsWith('_json'))) {
              const statement = db.prepare(`DELETE FROM ${quote(table)} WHERE instr(${quote(column)},?)>0`);
              for (const ref of refs) statement.run(ref);
            }
          }
          if (isAgent && schema.has('conversations')) db.exec(`DELETE FROM conversations
            WHERE NOT EXISTS (SELECT 1 FROM session_conversations s WHERE s.conversation_id=conversations.conversation_id)
            AND NOT EXISTS (SELECT 1 FROM session_windows w WHERE w.primary_conversation_id=conversations.conversation_id)`);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        finish(db);
      }
      for (const { db, schema } of agents) purgeReferences(db, schema, true);
      // Shared history is separate from credentials/configuration in this DB.
      const sharedFile = join(root, 'state/openclaw.sqlite');
      if (existsSync(sharedFile)) {
        const db = open(sharedFile, false); handles.push(db);
        purgeReferences(db, tables(db), false);
      }
      for (const copy of copies) if (expiredSet.has(copy.owner)) {
        if (copy.file) remove(copy.file);
        else {
          if (basename(copy.name) !== copy.name) throw new Error('unsafe native archive name');
          for (const file of files(join(root, 'agents', copy.agent))) if (basename(file) === copy.name) remove(file);
        }
      }
      // Session JSON exports are migration inputs and must not resurrect deleted
      // history. Remove expired entries; don't erase unrelated agent settings.
      for (const file of files(join(root, 'agents')).filter(f => /^sessions\.json(?:\..*)?$/.test(basename(f)))) {
        const store = JSON.parse(readFileSync(file, 'utf8'));
        for (const [key, value] of Object.entries(store)) if (refs.has(key) || refs.has(value?.sessionId)) delete store[key];
        writeFileSync(file, JSON.stringify(store), { mode: 0o600 });
      }
      // Auto-generated cross-conversation memory may paraphrase old messages
      // without complete provenance. It is deliberately not retained across TTL.
      for (const workspace of workspaces) {
        for (const name of ['MEMORY.md', 'memory.md']) remove(join(workspace, name));
        for (const file of files(join(workspace, 'memory'))) remove(file);
      }
    }
    // Retain only live birth anchors. File deletion completed before forgetting
    // expired anchors, so retries are idempotent after interrupted sweeps.
    ledger.births = Object.fromEntries(alive.map(row => [row.identity, row.born]));
    ledger.sessions = Object.fromEntries(alive.flatMap(row => [...row.ids].map(id => [`${row.agent}\n${id}`, row.born])));
    saveLedger(ledgerFile, ledger);
    return result;
  } finally { for (const db of handles.reverse()) db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const dryRun = process.argv.includes('--dry-run');
    console.log(JSON.stringify(sweep({ root: process.env.OPENCLAW_STATE_DIR || '/data', dryRun,
      exclusive: process.argv.includes('--offline'), workspaces: ['/home/node/.openclaw/workspace', '/data/workspace'] })));
  } catch (error) { console.error(`[retention] ${error.message}`); process.exitCode = 1; }
}

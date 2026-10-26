import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// OpenClaw's pinned image requires Node 24. The website still supports Node 22;
// its job skips this suite, while the dedicated gateway CI job runs it on 24.
if (Number(process.versions.node.split('.')[0]) < 24) {
  test('native retention is tested by the Node 24 gateway job', { skip: true }, () => {});
} else {
  const { DatabaseSync } = await import('node:sqlite');
  const { zstdCompressSync } = await import('node:zlib');
  const { sweep, TTL_MS } = await import('../fly/gateway/conversation-retention.mjs');
  const { supervise } = await import('../fly/gateway/retention-supervisor.mjs');
  const now = Date.UTC(2026, 9, 24);
  function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'goatlab-retention-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const agent = join(root, 'agents/main/agent');
    const sessions = join(root, 'agents/main/sessions');
    mkdirSync(agent, { recursive: true }); mkdirSync(sessions);
    const file = join(agent, 'openclaw-agent.sqlite');
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode=WAL;');
    db.exec(readFileSync(new URL('./fixtures/openclaw-agent-2026.9.6.sql', import.meta.url), 'utf8'));
    db.prepare('INSERT INTO schema_meta VALUES (?,?,?,?,?,?,?)').run('agent', 'agent', 23, 'main', '2026.9.6', now, now);
    db.prepare('INSERT INTO auth_profile_store VALUES (?,?,?)').run('auth', '{"apiKey":"KEEP-CREDENTIAL"}', now);
    const add = (key, id, born, archived = null) => {
      db.prepare('INSERT INTO session_nodes (session_key,current_session_id,entry_json,updated_at,created_at,archived_at) VALUES (?,?,?,?,?,?)')
        .run(key, id, JSON.stringify({ sessionId: id, updatedAt: now }), now, born, archived);
      db.prepare('INSERT INTO session_windows (session_id,session_key,created_at,updated_at) VALUES (?,?,?,?)').run(id, key, born, now);
      db.prepare('INSERT INTO transcript_events (session_id,seq,event_json,created_at) VALUES (?,?,?,?)').run(id, 1, JSON.stringify({ type: 'session', id, timestamp: new Date(born).toISOString() }), born);
      db.prepare('INSERT INTO transcript_events (session_id,seq,event_json,created_at) VALUES (?,?,?,?)').run(id, 2, JSON.stringify({ text: `PRIVATE-${id}` }), now);
    };
    writeFileSync(join(root, 'openclaw.json'), 'KEEP-CONFIG');
    return { root, file, sessions, db, add, options: { root, now, exclusive: true } };
  }

  test('expires active main and archived conversations at birth + 72h, preserving younger history and credentials', t => {
    const f = fixture(t);
    f.add('agent:main:main', 'old-active', now - TTL_MS);
    f.add('agent:main:archived', 'old-archived', now - TTL_MS - 1, now);
    f.add('agent:main:young', 'young', now - TTL_MS + 1);
    f.db.close();
    const result = sweep(f.options);
    assert.equal(result.expiredConversations, 2);
    const db = new DatabaseSync(f.file);
    assert.deepEqual(db.prepare('SELECT session_id FROM session_windows').all().map(r => r.session_id), ['young']);
    assert.equal(db.prepare('SELECT store_json FROM auth_profile_store').get().store_json, '{"apiKey":"KEEP-CREDENTIAL"}');
    assert.equal(readFileSync(join(f.root, 'openclaw.json'), 'utf8'), 'KEEP-CONFIG');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    db.close();
    assert.equal(readFileSync(f.file).includes(Buffer.from('PRIVATE-old-active')), false);
  });

  test('deletes reset generations, compressed archives, FTS, memories and file copies; new activity cannot renew age', t => {
    const f = fixture(t);
    f.add('agent:main:main', 'new-generation', now - 1000);
    f.db.prepare('INSERT INTO session_windows (session_id,session_key,created_at,updated_at) VALUES (?,?,?,?)').run('old-generation', 'agent:main:main', now - TTL_MS, now);
    const blob = zstdCompressSync(Buffer.from(JSON.stringify({ type: 'session', id: 'archive-only', timestamp: new Date(now - TTL_MS).toISOString() }) + '\n{"text":"PRIVATE-ARCHIVE"}'));
    f.db.prepare('INSERT INTO session_transcript_archives (session_id,generation,session_key,reason,encoding,archive_blob,archive_sha256,archive_name,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run('archive-only', 'g', 'agent:main:deleted', 'deleted', 'zstd', blob, '0'.repeat(64), 'archive-only.jsonl.deleted.today.zst', now);
    f.db.prepare('INSERT INTO session_transcript_fts (text,session_id) VALUES (?,?)').run('PRIVATE-INDEX', 'old-generation');
    f.db.prepare('INSERT INTO cache_entries VALUES (?,?,?,?,?,?)').run('transcript', 'old', 'PRIVATE-CACHE', null, null, now);
    writeFileSync(join(f.sessions, 'archive-only.jsonl.deleted.today.zst'), blob);
    writeFileSync(join(f.sessions, 'old-generation.jsonl.reset.today'), JSON.stringify({ type: 'session', id: 'old-generation', timestamp: new Date(now - TTL_MS).toISOString() }));
    f.db.close();
    sweep(f.options);
    const db = new DatabaseSync(f.file);
    for (const table of ['session_nodes', 'session_windows', 'transcript_events', 'session_transcript_archives', 'session_transcript_fts', 'cache_entries']) {
      assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0, table);
    }
    db.close();
    assert.equal(existsSync(join(f.sessions, 'archive-only.jsonl.deleted.today.zst')), false);
    assert.equal(readFileSync(f.file).includes(Buffer.from('PRIVATE-')), false);
  });

  test('preview is read only; restart and archive timestamps cannot postpone expiry', t => {
    const f = fixture(t);
    f.add('agent:main:main', 'active', now - TTL_MS + 100);
    f.db.close();
    const before = readFileSync(f.file);
    const plan = sweep({ ...f.options, dryRun: true });
    assert.equal(plan.nextExpiry, now + 100);
    assert.deepEqual(readFileSync(f.file), before);
    assert.equal(sweep({ ...f.options, now: now + 99 }).expiredConversations, 0);
    assert.equal(sweep({ ...f.options, now: now + 100 }).expiredConversations, 1);
    assert.equal(sweep({ ...f.options, now: now + 101 }).expiredConversations, 0);
  });

  test('fails closed on unsupported schema instead of deleting credentials or silently skipping history', t => {
    const f = fixture(t); f.db.exec('ALTER TABLE session_windows RENAME COLUMN created_at TO unknown_birth'); f.db.close();
    assert.throws(() => sweep(f.options), /schema/i);
    assert.equal(readFileSync(join(f.root, 'openclaw.json'), 'utf8'), 'KEEP-CONFIG');
  });

  test('clears embedded shared history and fork copies, keeping config, OAuth and unrelated live sessions', t => {
    const f = fixture(t);
    f.add('agent:main:main', 'expired', now - TTL_MS);
    f.add('agent:main:fork', 'fork', now - 1000);
    f.add('agent:main:separate', 'independent', now - 1000);
    f.db.prepare('UPDATE session_nodes SET fork_source_session_id=? WHERE current_session_id=?').run('expired', 'fork');
    f.db.close();
    mkdirSync(join(f.root, 'state'));
    const shared = new DatabaseSync(join(f.root, 'state/openclaw.sqlite'));
    shared.exec(`CREATE TABLE flow_runs (id TEXT, state_json TEXT);
      CREATE TABLE config_machine_state (config_key TEXT, value_json TEXT);
      CREATE TABLE mcp_oauth_stores (store_key TEXT, store_json TEXT);`);
    shared.exec(`INSERT INTO flow_runs VALUES ('old','{"sessionId":"expired","text":"PRIVATE-SHARED"}');
      INSERT INTO config_machine_state VALUES ('c','KEEP-CONFIG');
      INSERT INTO mcp_oauth_stores VALUES ('auth','KEEP-OAUTH');`);
    shared.close();
    assert.equal(sweep(f.options).expiredConversations, 2);
    const check = new DatabaseSync(f.file);
    assert.deepEqual(check.prepare('SELECT current_session_id FROM session_nodes').all().map(r => r.current_session_id), ['independent']); check.close();
    const after = new DatabaseSync(join(f.root, 'state/openclaw.sqlite'));
    assert.equal(after.prepare('SELECT count(*) n FROM flow_runs').get().n, 0);
    assert.equal(after.prepare('SELECT value_json FROM config_machine_state').get().value_json, 'KEEP-CONFIG');
    assert.equal(after.prepare('SELECT store_json FROM mcp_oauth_stores').get().store_json, 'KEEP-OAUTH');
    after.close();
  });

  test('does not retain cold file archives or their embedded SQLite descriptors', t => {
    const f = fixture(t); f.add('agent:main:cold', 'cold', now - TTL_MS);
    const name = 'a'.repeat(64) + '.jsonl.zst';
    const blob = zstdCompressSync(Buffer.from('{"kind":"header","version":1,"sessionId":"cold","generation":"g"}\n'));
    mkdirSync(join(f.sessions, 'cold'));
    writeFileSync(join(f.sessions, 'cold', name), blob);
    f.db.prepare('INSERT INTO session_transcript_cold_archives VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run('cold', 'g', name, 'a'.repeat(64), 1, 100, blob.length, 1, now, 'file', null);
    f.db.close();
    sweep(f.options);
    assert.equal(existsSync(join(f.sessions, 'cold', name)), false);
  });

  test('refuses write mode without offline ownership', t => {
    const f = fixture(t); f.db.close();
    assert.throws(() => sweep({ root: f.root, now }), /exclusive/);
  });

  test('retries an interrupted purge without extending a file copy by its newer archive date', t => {
    const f = fixture(t); f.db.close();
    writeFileSync(join(f.root, '.conversation-retention.json'), JSON.stringify({ version: 1,
      births: { 'main\nagent:main:main': now - TTL_MS }, sessions: { 'main\ninterrupted': now - TTL_MS } }));
    const file = join(f.sessions, 'interrupted.jsonl.deleted.recent');
    writeFileSync(file, JSON.stringify({ type: 'session', id: 'interrupted', timestamp: new Date(now).toISOString() }));
    assert.equal(sweep(f.options).expiredConversations, 1);
    assert.equal(existsSync(file), false);
    assert.deepEqual(JSON.parse(readFileSync(join(f.root, '.conversation-retention.json'), 'utf8')).sessions, {});
  });

  test('startup purges conversations expired while stopped and preserves enabled idle shutdown', { timeout: 6000 }, async t => {
    const f = fixture(t);
    f.add('agent:main:main', 'expired-while-stopped', Date.now() - TTL_MS - 1000);
    f.db.close();
    const previous = process.env.GOATLAB_IDLE_STOP_ENABLED;
    process.env.GOATLAB_IDLE_STOP_ENABLED = '1';
    const runtime = join(f.root, 'startup-runtime.mjs');
    const report = join(f.root, 'startup-report.json');
    writeFileSync(runtime, `import { DatabaseSync } from 'node:sqlite';
      import { writeFileSync } from 'node:fs';
      const db = new DatabaseSync(${JSON.stringify(f.file)});
      writeFileSync(${JSON.stringify(report)}, JSON.stringify({
        sessions: db.prepare('SELECT current_session_id FROM session_nodes').all(),
        idleStop: process.env.GOATLAB_IDLE_STOP_ENABLED,
      }));
      db.close();
      setInterval(() => {}, 1000);`);
    const controller = new AbortController();
    const running = supervise({ root: f.root, runtime, workspaces: [], pollMs: 10,
      signal: controller.signal, log: () => {} });
    try {
      const deadline = Date.now() + 4000;
      while (!existsSync(report) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
      assert.deepEqual(JSON.parse(readFileSync(report, 'utf8')), { sessions: [], idleStop: '1' });
    } finally {
      controller.abort();
      await running;
      if (previous === undefined) delete process.env.GOATLAB_IDLE_STOP_ENABLED;
      else process.env.GOATLAB_IDLE_STOP_ENABLED = previous;
    }
  });

  test('supervisor stops a live writer before purging and starts a new session without resurrection', async t => {
    const f = fixture(t);
    const expiry = Date.now() + 1200;
    f.add('agent:main:main', 'writer', expiry - TTL_MS); f.db.close();
    const runtime = join(f.root, 'fake-runtime.mjs');
    writeFileSync(runtime, `import { DatabaseSync } from 'node:sqlite';
      import { appendFileSync } from 'node:fs';
      const db=new DatabaseSync(${JSON.stringify(f.file)});
      db.exec('PRAGMA busy_timeout=5000;');
      process.on('SIGTERM',()=>{});
      if (!db.prepare('SELECT 1 FROM session_nodes').get()) {
        db.prepare('INSERT INTO session_nodes (session_key,current_session_id,entry_json,updated_at,created_at) VALUES (?,?,?,?,?)').run('agent:main:main','fresh','{}',Date.now(),Date.now());
        db.prepare('INSERT INTO session_windows (session_id,session_key,created_at,updated_at) VALUES (?,?,?,?)').run('fresh','agent:main:main',Date.now(),Date.now());
      }
      appendFileSync(${JSON.stringify(join(f.root, 'starts'))},'started\\n');
      setInterval(()=>db.prepare('UPDATE session_nodes SET updated_at=?').run(Date.now()),5);`);
    const controller = new AbortController();
    const logs = [];
    const running = supervise({ root: f.root, runtime, workspaces: [], graceMs: 100, scanMs: 20, pollMs: 10, signal: controller.signal,
      log: line => { logs.push(line); if (logs.filter(x => x.includes('offline sweep')).length === 2) setTimeout(() => controller.abort(), 100); } });
    const timeout = setTimeout(() => controller.abort(), 6000);
    await running; clearTimeout(timeout);
    assert.equal(readFileSync(join(f.root, 'starts'), 'utf8').trim().split('\n').length, 2);
    const db = new DatabaseSync(f.file);
    assert.deepEqual(db.prepare('SELECT current_session_id FROM session_nodes').all().map(r => r.current_session_id), ['fresh']);
    assert.equal(db.prepare("SELECT count(*) n FROM transcript_events WHERE session_id='writer'").get().n, 0);
    db.close();
  });
}

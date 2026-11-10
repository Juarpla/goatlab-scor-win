/** One-off verified migration: clears a match's media so an updated contract
 *  (new prompt document) can regenerate from a clean slate. Deletes the public
 *  R2 prefix first, then strips the match's slots/attempts/resources from the
 *  shared private state with the same CAS cycle. Idempotent. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgnesStateClient } from './agnes-state.mjs';

const run = promisify(execFile);
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export async function migrateMatchBank({ matchId, env = process.env, repo = env.GOATLAB_REPO || '.', yes = false } = {}) {
  if (!ID.test(matchId ?? '')) throw new Error('matchId inválido');
  if (!yes) throw new Error('confirme con --yes junto al fight ID exacto');
  const client = new AgnesStateClient({ env });
  const r2tool = join(repo, 'scripts/r2-media.mjs');
  const summary = { deleted: null, slots: 0, attempts: 0, resources: 0 };
  const { state, etag } = await client.readState();
  const prefix = `partidos/${matchId}/`;
  try {
    const { stdout } = await run(process.execPath, [r2tool, 'del-prefix', prefix], {
      cwd: repo, env: { ...env, R2_NO_DOTENV: '1' }, maxBuffer: 8 * 1024 * 1024,
    });
    summary.deleted = JSON.parse(stdout);
  } catch (error) { summary.deleted = 'del-prefix no disponible: ' + String(error.stderr || error.message).replace(/https?:\/\/\S+/g, '[endpoint]'); }

  const slotKeys = Object.entries(state.slots).filter(([, row]) => row.matchId === matchId).map(([key]) => key);
  const attemptIds = Object.entries(state.attempts).filter(([, attempt]) => attempt.slotKey && slotKeys.includes(attempt.slotKey)).map(([id]) => id);
  for (const key of slotKeys) delete state.slots[key];
  for (const attemptId of attemptIds) delete state.attempts[attemptId];
  for (const [key, resource] of Object.entries(state.resources ?? {})) if (resource.matchId === matchId) { delete state.resources[key]; summary.resources++; }
  if (state.activeVideoAttemptId && attemptIds.includes(state.activeVideoAttemptId)) delete state.activeVideoAttemptId;
  summary.slots = slotKeys.length; summary.attempts = attemptIds.length;

  if ((summary.slots || summary.attempts || summary.resources) && etag) {
    const response = await client.request('PUT', JSON.parse(JSON.stringify(state)), { 'if-match': etag });
    if (!response.ok) throw new Error('PUT de estado HTTP ' + response.status + '; migración sin confirmar');
    summary.saved = true;
  } else summary.saved = false;
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i = arg.indexOf('='); return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)]; }));
  const summary = await migrateMatchBank({ matchId: args['--match'], env: process.env, yes: args['--yes'] === true });
  process.stdout.write(JSON.stringify(summary) + '\n');
}

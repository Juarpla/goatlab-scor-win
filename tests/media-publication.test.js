import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stageMedia, pushMedia } from '../scripts/publish-media.mjs';
const execute = promisify(execFile);
async function fixture(t) {
  const repo = await mkdtemp(join(tmpdir(), 'goatlab-stage-')); t.after(() => rm(repo,{recursive:true,force:true}));
  const git = async (...args) => (await execute('git',args,{cwd:repo})).stdout.trim();
  await git('init','-b','main'); await git('config','user.name','Test'); await git('config','user.email','test@example.test');
  await mkdir(join(repo,'public/data/media-pack/gen/a'),{recursive:true});
  await writeFile(join(repo,'public/data/media-pack/old.json'),'{}');
  await writeFile(join(repo,'public/data/media-pack/old.progress.json'),'{}');
  await git('add','.'); await git('commit','-m','base');
  return {repo,git};
}
test('only complete A, progress/report and authorized deletions are staged, excluding partial B and binaries',async t=>{
  const {repo,git}=await fixture(t);
  for(const path of ['a.json','b.json','a.progress.json','b.progress.json','_agnes-hourly.json','a.ready','a.running','agnes.sqlite','a.tmp','gen/a/0.jpg','gen/a/task.json']) await writeFile(join(repo,'public/data/media-pack',path),'{}');
  await writeFile(join(repo,'public/data/agnes-quota.json'),'{}');
  await rm(join(repo,'public/data/media-pack/old.json')); await rm(join(repo,'public/data/media-pack/old.progress.json'));
  await stageMedia({repo,publication:{allow_commit:true,complete_ids:['a'],deleted_ids:['old']}});
  const staged=await git('diff','--cached','--no-renames','--name-status');
  assert.match(staged,/D\s+public\/data\/media-pack\/old.json/);
  assert.match(staged,/A\s+public\/data\/media-pack\/a.json/);
  assert.match(staged,/A\s+public\/data\/media-pack\/b.progress.json/);
  assert.doesNotMatch(staged,/\bb.json|gen\/|\.ready|\.running|sqlite|\.tmp/);
});
test('unrelated staged work is rejected instead of being included in the media commit',async t=>{
  const {repo,git}=await fixture(t); await writeFile(join(repo,'other.txt'),'data'); await git('add','other.txt');
  await assert.rejects(stageMedia({repo}),/ajenos/);
});
test('push exhaustion is explicit after fetching on each of three attempts',async t=>{
  const {repo,git}=await fixture(t);
  const remote=join(repo,'remote.git'); await execute('git',['init','--bare',remote]);
  await git('remote','add','origin',remote); await git('push','origin','main');
  const hook=join(remote,'hooks/pre-receive'); await writeFile(hook,'#!/bin/sh\nexit 1\n',{mode:0o755});
  await writeFile(join(repo,'change'),'data'); await git('add','change'); await git('commit','-m','change');
  await assert.rejects(pushMedia({repo}),/tres intentos/);
});
test('all media workflow shell blocks parse with bash and schedules preserve the queue',async()=>{
  const source=await readFile('.github/workflows/media-bank.yml','utf8');
  assert.match(source,/cron: '15 7,9,11 \* \* \*'/); assert.match(source,/queue: max/); assert.match(source,/cancel-in-progress: false/);
  assert.doesNotMatch(source,/cache: pnpm|flyctl|fly machines/);
  const lines=source.split('\n');
  for(let i=0;i<lines.length;i++) if(/^        run: \|$/.test(lines[i])) {
    let shell=''; while(i+1<lines.length && (/^          /.test(lines[i+1]) || !lines[i+1].trim())) shell+=lines[++i].slice(10)+'\n';
    await execute('bash',['-n','-c',shell]);
  }
  const full=await readFile('.github/workflows/publish.yml','utf8'); assert.match(full,/5 6 \* \* \*/); assert.match(full,/17 \*\/6 \* \* \*/);
});

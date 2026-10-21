import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {extractReviewFrames} from '../fly/render/review-frames.mjs';
const run=promisify(execFile);
test('one FFmpeg decode extracts eight actual sampled frames at half resolution',async t=>{
 const tmp=mkdtempSync(join(tmpdir(),'goatlab-review-sample-'));t.after(()=>rmSync(tmp,{recursive:true,force:true}));
 const file=join(tmp,'tiny.mp4');
 await run('ffmpeg',['-y','-loglevel','error','-f','lavfi','-i','color=c=blue:s=1080x1920:r=30:d=2','-threads','2','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',file],{timeout:10000});
 let calls=0;
 const frames=await extractReviewFrames({file,tmp,plan:{scenes:[]},duration:2,revision:1,run:async(...args)=>{calls++;return run(...args);}});
 assert.equal(calls,1);assert.equal(frames.length,8);
 const {stdout}=await run('ffprobe',['-v','error','-show_entries','stream=width,height','-of','json',join(tmp,frames[7].name)]);
 assert.deepEqual(JSON.parse(stdout).streams.map(({width,height})=>[width,height]),[[540,960]]);
});

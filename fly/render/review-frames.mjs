import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { reviewTimes } from './creative-job.mjs';

/** Decode the approved-format MP4 once, producing at most eight small JPEGs. */
export async function extractReviewFrames({ file, tmp, plan, duration, revision, run = promisify(execFile) }) {
  const times = reviewTimes(plan, duration);
  const select = times.map(time => `eq(n\\,${Math.round(time * 30)})`).join('+');
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-threads', '2', '-i', file,
    '-vf', `select=${select},scale=540:-2`, '-fps_mode', 'passthrough', '-frames:v', String(times.length),
    '-threads', '1', '-q:v', '3', '-start_number', '0', join(tmp, `review-${revision}-%d.jpg`)], { timeout: 90_000 });
  return times.map((time, index) => {
    const name = `review-${revision}-${index}.jpg`;
    if (!existsSync(join(tmp, name))) throw new Error('muestreo de revisión incompleto');
    return { name, time };
  });
}

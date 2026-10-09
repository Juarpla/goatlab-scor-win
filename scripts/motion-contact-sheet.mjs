/** Mosaicos QA de los 10 clips: settled + mids en 2 imágenes para 2 llamadas de visión.
 * OpenClaw deriva los tiempos del plan que acaba de montar por clip:
 *   settled = at + duration * 0.7, mid = at + duration * 0.4 (por cada motion graphic).
 * Uso: node scripts/motion-contact-sheet.mjs --tag=<matchId> --out=<dir>
 *        --shots "clip1.mp4@12.5,18.2;clip2.mp4@9.1,15.0" (par settled,mid por clip)
 * Si un clip necesita zoom, los frames a tamaño completo quedan en <out>/stills/.
 * Uso: node scripts/motion-contact-sheet.mjs --tag=<matchId> --zoom=<clip.mp4@t> */
import { mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const eq = a.indexOf('=');
  if (eq > 2) args[a.slice(2, eq)] = a.slice(eq + 1);
  else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[a.slice(2)] = argv[++i];
  else args[a.slice(2)] = true;
}
if (!args.tag || (!args.shots && !args.zoom)) {
  console.error('Uso: --tag=<matchId> --out=<dir> --shots "clip.mp4@settled,mid;..." | --zoom=<clip.mp4@t>');
  process.exit(2);
}
const out = args.out ?? 'public/data/motion-sheets';
const stills = `${out}/stills`;
await mkdir(stills, { recursive: true });
const grab = (video, t, dest, scale = null) => {
  const vf = scale ? ['-vf', `scale=${scale}`] : [];
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', video, '-frames:v', '1', ...vf, dest], { stdio: 'inherit' });
};
if (args.zoom) {
  const [video, t] = String(args.zoom).split('@');
  const dest = `${stills}/${args.tag}-zoom-${Date.now()}.jpg`;
  grab(video, Number(t), dest);
  console.log(`zoom: ${dest}`);
  process.exit(0);
}
const shots = String(args.shots).split(';').filter(Boolean).map(s => {
  const [video, times] = s.split('@');
  const [settled, mid] = (times ?? '').split(',').map(Number);
  if (!video || !Number.isFinite(settled) || !Number.isFinite(mid)) throw new Error(`shot inválido: ${s}`);
  return { video, settled, mid };
});
if (shots.length > 12) throw new Error('máximo 12 clips por mosaico');
const thumbs = [];
shots.forEach((shot, i) => {
  for (const [kind, t] of [['settled', shot.settled], ['mid', shot.mid]]) {
    const full = `${stills}/${args.tag}-c${i + 1}-${kind}.jpg`;
    grab(shot.video, t, full);
    const thumb = `${stills}/${args.tag}-c${i + 1}-${kind}-thumb.jpg`;
    grab(shot.video, t, thumb, '360:640');
    thumbs.push({ kind, thumb });
  }
});
const tile = (kind, dest) => {
  const list = thumbs.filter(t => t.kind === kind).map(t => t.thumb);
  const cols = Math.ceil(Math.sqrt(list.length));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...list.flatMap(f => ['-i', f]),
    '-filter_complex', `tile=${cols}x${Math.ceil(list.length / cols)}`, dest], { stdio: 'inherit' });
};
const settledSheet = `${out}/${args.tag}-sheet-settled.jpg`;
const midsSheet = `${out}/${args.tag}-sheet-mids.jpg`;
tile('settled', settledSheet);
tile('mid', midsSheet);
console.log(`mosaicos: ${settledSheet} + ${midsSheet} (${shots.length} clips)`);

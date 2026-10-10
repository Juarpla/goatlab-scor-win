import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readMediaBank } from '../lib/media-reader.js';

const args = Object.fromEntries(process.argv.slice(2).map(value => { const at = value.indexOf('='); return [value.slice(0, at), value.slice(at+1)]; }));
const json = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } };
try {
  const repo = process.env.GOATLAB_REPO || '.';
  const snapshot = await json(args['--content']) ?? {};
  const script = await json(join(repo, 'public/data/youtube-scripts', args['--match'] + '.json'));
  const content = {production:snapshot.production ?? null};
  for (const category of ['image-prompts', 'video-prompts', 'motion-prompts']) content[category] = Object.hasOwn(snapshot, category) ? snapshot[category] : await json(join(repo, 'public/data', category, args['--match'] + '.json'));
  const identity = snapshot.match ?? script ?? content['image-prompts'] ?? content['video-prompts'];
  const result = await readMediaBank({ match: { ...identity, webId: args['--match'] }, content, dir: args['--out'] });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error('consulta R2: ' + (error.message === 'partido inválido' ? error.message : error.name));
  process.exitCode = 1;
}

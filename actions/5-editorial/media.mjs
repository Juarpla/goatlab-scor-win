import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { queryD1 } from '../../scripts/d1-query.mjs';
import { exists, get, put, publicUrl } from '../../scripts/r2-media.mjs';
import { editorialImage } from '../../src/lib/editorial-media.js';
import { isEditorialSlug } from '../../src/lib/editorial.js';

const run = promisify(execFile);
const root = '.cache/editorial-media';
const failures = [];
const report = [];
await mkdir(root, { recursive: true });
const [catalog] = await queryD1({ sql: 'SELECT slug FROM editorials WHERE retired_at IS NULL ORDER BY position, slug LIMIT 20' });
for (const { slug } of catalog.results) {
  if (!isEditorialSlug(slug)) throw new Error('Invalid editorial slug');
  for (const [index, role] of ['cover', 'detail'].entries()) {
    try {
      const [result] = await queryD1({ sql: 'SELECT title, payload FROM (SELECT json_extract(payload, \'$.title\') AS title, payload FROM editorials WHERE slug = ? AND retired_at IS NULL)', params: [slug] });
      const row = result.results[0];
      if (!row) break;
      const article = JSON.parse(row.payload);
      if (editorialImage(article.media?.[role])) { report.push({ slug, role, status: 'existente' }); continue; }
      const excerpt = [article.leadHtml, article.bodyHtml].join(' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 1700);
      const prompt = `Create an original 16:9 editorial illustration for GoatLab, a Spanish football data magazine. Topic: ${row.title}. Context for visual symbolism only: ${excerpt}. ${role === 'cover' ? 'Wide cinematic cover with a strong focal point, football and the economics or statistics described by the article.' : 'A complementary close-up still life explaining the article visually through football objects, stadium architecture, financial or analytical symbols; a distinctly different composition from the cover.'} Premium illustrated editorial art, detailed tactile materials, dark forest green and charcoal palette, lime accents, warm ivory highlights, subtle grain, thoughtful negative space. No lettering, numbers, watermarks, club crests or brand logos. No invented charts or factual labels. Do not depict a real transaction, documentary photograph or identifiable real person. An evocative illustration, not evidence of an actual event.`;
      const version = createHash('sha256').update(`editorial-v1:${slug}:${role}`).digest('hex').slice(0, 12);
      const id = `editorial-${slug}-${version}`;
      const key = `editoriales/${slug}/${role}-${version}.webp`;
      const metadataKey = `editoriales/${slug}/${role}-${version}.json`;
      let image;
      // A committed object+manifest recovers safely after a D1 write failure.
      if (await exists(metadataKey)) {
        image = JSON.parse((await get(metadataKey, 16000)).toString());
        if (!editorialImage(image) || image.url !== publicUrl(key) || !await exists(key)) throw new Error('Invalid saved media manifest');
      } else {
        const folder = `${root}/${id}`;
        await mkdir(folder, { recursive: true });
        let identity;
        try { identity = JSON.parse(await readFile(`${folder}/identity.json`, 'utf8')); } catch {}
        identity = { id, slug, index, prompt: identity?.prompt ?? prompt, title: row.title, retired: false, observedAt: Date.now() / 1000,
          expiresAt: identity?.expiresAt ?? Date.now() / 1000 + 6 * 86400 };
        await writeFile(`${folder}/identity.json`, JSON.stringify(identity));
        console.log(`Agnes: ${slug} / ${role}`);
        const { stdout } = await run('python3', ['actions/5-editorial/image.py', `${folder}/identity.json`], { timeout: 450000, maxBuffer: 2_000_000 });
        const generated = JSON.parse(stdout);
        const output = `${folder}/${role}.webp`;
        await run('ffmpeg', ['-y', '-i', generated.path, '-vf', 'scale=1280:-2', '-c:v', 'libwebp', '-quality', '82', output], { timeout: 60000 });
        const { stdout: probe } = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', output]);
        const { width, height } = JSON.parse(probe).streams[0];
        const bytes = await readFile(output);
        if (bytes.length > 1_500_000) throw new Error('Editorial image exceeds size budget');
        image = { source: 'agnes', url: publicUrl(key), width, height,
          alt: `Ilustración conceptual: ${row.title}`, caption: role === 'detail' ? 'Una mirada visual al contexto del artículo.' : 'Fútbol, cifras y contexto.',
          model: generated.model, generatedAt: generated.at, sha256: createHash('sha256').update(bytes).digest('hex') };
        await put(key, bytes, 'image/webp', {}, { 'cache-control': 'public, max-age=31536000, immutable' });
        await put(metadataKey, Buffer.from(JSON.stringify(image)), 'application/json');
      }
      const [saved] = await queryD1({ sql: `UPDATE editorials SET payload = json_set(payload, '$.media.${role}', json(?)), updated_at = ? WHERE slug = ? AND retired_at IS NULL AND json_extract(payload, '$.media.${role}.url') IS NULL`, params: [JSON.stringify(image), new Date().toISOString(), slug] });
      if (!saved.meta.changes) throw new Error('Editorial changed before media publication');
      report.push({ slug, role, status: 'publicada', url: image.url });
    } catch (error) {
      failures.push({ slug, role, error: String(error.stderr || error.message).replace(/https?:\/\/\S+/g, '[endpoint]').slice(0, 600) });
      console.error(`Media failed: ${slug} / ${role}`);
      // Global admission failures must not fan out into many repeated requests.
      if (/incierto|autoridad|429|503|timeout/i.test(String(error.stderr || error.message))) break;
    }
  }
  if (failures.some(item => /incierto|autoridad|429|503|timeout/i.test(item.error))) break;
}
await writeFile(`${root}/report.json`, JSON.stringify({ at: new Date().toISOString(), report, failures }, null, 2));
console.log(JSON.stringify({ published: report.filter(row => row.status === 'publicada').length, reused: report.filter(row => row.status === 'existente').length, failures }));
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, `## Imágenes editoriales\n\n${report.filter(row => row.status === 'publicada').length} publicadas; ${failures.length} fallos. Consulta el artefacto para ver el detalle.\n`, { flag: 'a' });
if (failures.length) process.exitCode = 1;

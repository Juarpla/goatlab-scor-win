import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { EDITORIAL_LIMIT, isEditorialSlug, safeEditorialLink } from '../../src/lib/editorial.js';
import { extractJson, withFailover } from '../../src/lib/llm.js';
import { queryD1 } from '../../scripts/d1-query.mjs';

const now = new Date().toISOString();
const preview = process.argv.includes('--preview');
const refresh = process.argv.includes('--refresh');
const catalog = JSON.parse(await readFile(new URL('./finance-topics.json', import.meta.url), 'utf8'));
if (!catalog.every(topic => isEditorialSlug(topic.slug))) throw new Error('Invalid editorial slug');
const template = await readFile(new URL('./TEMPLATE.md', import.meta.url), 'utf8');
const [state] = await queryD1({ sql: 'SELECT * FROM editorials ORDER BY checked_at, position' });
const active = state.results.filter(row => !row.retired_at);
const known = new Set(state.results.map(row => row.slug));
const remaining = catalog.filter(topic => !known.has(topic.slug));
// The calendar makes retries deterministic within a day and rotates past unavailable sources.
const rotation = Math.floor((Date.now() - Date.UTC(2026, 10, 14)) / (3 * 86_400_000));
const requested = process.argv.find(arg => arg.startsWith('--topic='))?.split('=')[1];
if (requested && (!preview || !remaining.some(topic => topic.slug === requested))) throw new Error('Topic overrides are for unpublished previews');
const candidate = !refresh && active.length < EDITORIAL_LIMIT && remaining.length
  ? remaining.find(topic => topic.slug === requested) ?? remaining[((rotation % remaining.length) + remaining.length) % remaining.length] : null;
const row = candidate ? null : active[0];
if (!candidate && !row) throw new Error('No active editorial or available topic');
const old = row ? JSON.parse(row.payload) : null;
const topic = candidate ?? {
  slug: row.slug,
  title: old.title,
  question: old.nextQuestion ?? `¿Qué análisis nuevo, comprobable con las fuentes, aporta valor al artículo «${old.title}»?`,
  sources: catalog.find(item => item.slug === row.slug)?.sources ?? old.sources,
};
console.log(`${preview ? 'Preview' : 'Scheduled'} ${candidate ? 'creation' : 'refresh'}: ${topic.slug}; ${active.length} active`);

const clean = text => String(text).replace(/\s+/g, ' ').trim();
const decode = text => text.replace(/&#(x[\da-f]+|\d+);/gi, (entity, code) => {
  const point = /^x/i.test(code) ? parseInt(code.slice(1), 16) : Number(code);
  return point <= 0x10ffff ? String.fromCodePoint(point) : entity;
}).replace(/&(amp|lt|gt|quot|apos|nbsp|ndash|mdash|euro|pound);/g, (_, key) =>
  ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', euro: '€', pound: '£' })[key]);
const strip = html => clean(decode(html.replace(/<(script|style|nav|footer|header|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<\/[^>]+>/g, ' ').replace(/<[^>]*>/g, '')));

async function fetchSource(source) {
  if (!safeEditorialLink(source.url)) throw new Error('Unsupported source URL');
  const response = await fetch(source.url, {
    headers: { Accept: 'text/html,application/pdf', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(35_000),
  });
  if (!response.ok || !safeEditorialLink(response.url)) throw new Error(`Source HTTP ${response.status}`);
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/pdf')) {
    const pdf = Buffer.from(await response.arrayBuffer());
    if (pdf.length > 22_000_000) throw new Error('Source PDF exceeded size limit');
    return clean(execFileSync('pdftotext', ['-f', '1', '-l', '30', '-layout', '-', '-'], { input: pdf, timeout: 20_000, maxBuffer: 3_000_000, encoding: 'utf8' }));
  }
  const html = await response.text();
  return strip(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html);
}

const selections = await Promise.all(topic.sources.slice(0, 8).map(async source => {
  try {
    const text = await fetchSource(source);
    if (text.length < 95) return null;
    return { name: source.name, url: source.url, note: source.note, text: text.slice(0, 18_000) };
  } catch (error) {
    console.warn(`Source unavailable: ${source.name} (${error.message})`);
    return null;
  }
}));
const documents = selections.filter(Boolean).map(doc => ({
  ...doc,
  passages: doc.text.match(/[^.!?]*(?:[.!?]+(?=\s|$)|$)/g)
    .map(clean).filter(passage => passage.length >= 22).slice(0, 100),
}));
const digest = createHash('sha256').update(JSON.stringify(documents.map(({ url, text }) => [url, text]))).digest('hex');
const check = { slug: topic.slug, date: now, sourceUrls: documents.map(doc => doc.url), mode: candidate ? 'create' : 'refresh' };
const report = async value => {
  await mkdir('editorial-brief', { recursive: true });
  await writeFile(`editorial-brief/${topic.slug}.json`, JSON.stringify({ ...check, ...value }, null, 2));
};

function textField(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[<>]/.test(value);
}

function invalid(reason) {
  throw new Error(`Invalid editorial draft: ${reason}`);
}

function validate(raw) {
  const value = extractJson(raw);
  if (!Array.isArray(value?.sections)) return invalid('sections missing');
  if (!candidate && value.sections.length === 0) return value;
  if (value.sections.length < (candidate ? 4 : 1) || value.sections.length > (candidate ? 5 : 2)) return invalid('section count');
  if (!value.sections.every(({ heading, paragraphs }) => textField(heading, 4, 130) && Array.isArray(paragraphs)
    && paragraphs.length >= 2 && paragraphs.length <= 4 && paragraphs.every(text => textField(text, 65, 1600)))) return invalid('paragraphs or heading');
  if (!textField(value.nextQuestion, 18, 300)) return invalid('missing next question');
  if (!Array.isArray(value.evidence) || value.evidence.length < (candidate ? 4 : 2)) return invalid('evidence count');
  const verified = value.evidence.filter(({ source, passage: quote, claim }) =>
    Number.isInteger(source) && Number.isInteger(quote) && documents[source - 1]?.passages[quote - 1] && textField(claim, 16, 350));
  if (verified.length !== value.evidence.length || new Set(verified.map(item => item.source)).size < 2) return invalid('source quotes missing or unmatched');
  if (!candidate) return value;
  if (!Array.isArray(value.lead) || value.lead.length < 1 || value.lead.length > 3
    || !value.lead.every(text => textField(text, 80, 1300))) return invalid('lead');
  if (!textField(value.description, 45, 300)) return invalid('description');
  const words = [...value.lead, ...value.sections.flatMap(section => section.paragraphs)].join(' ').split(/\s+/).length;
  if (words < 500 || words > 1600) return invalid(`article length (${words} words)`);
  return value;
}

const escape = string => string.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const paragraph = text => {
  const emphasized = /\*\*[^*]+\*\*/.test(text) ? text : text.replace(/\b\d[\d.,]*\s?(?:%|millones|euros|dólares)/i, '**$&**');
  return `<p>${escape(emphasized).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</p>`;
};
const sectionsHtml = sections => sections.map(section => `<h2>${escape(section.heading)}</h2>${section.paragraphs.map(paragraph).join('')}`).join('');
const touch = async () => {
  if (!preview && row) await queryD1({ sql: 'UPDATE editorials SET checked_at = ? WHERE slug = ? AND retired_at IS NULL', params: [now, row.slug] });
};

if (documents.length < 2 || row && old.evidenceHash === digest) {
  await touch();
  await report({ status: documents.length < 2 ? 'insufficient-evidence' : 'sources-unchanged' });
  console.log('Current publication preserved.');
  process.exit(0);
}

let draft;
try {
  ({ value: draft } = await withFailover([
    { role: 'system', content: template },
    { role: 'user', content: JSON.stringify({
      mode: candidate ? 'create' : 'refresh', title: topic.title, question: topic.question, visual: topic.visual,
      current: old ? strip([old.leadHtml, old.bodyHtml, old.extraHtml, old.updateHtml].filter(Boolean).join(' ')).slice(0, 14000) : null,
      documents: documents.map(({ name, note, passages }, index) => ({ source: index + 1, name, note, passages: passages.map((text, i) => [i + 1, text]) })),
    }) },
  ], { maxTokens: 16000, timeoutMs: 100_000, validate, orderVar: 'EDITORIAL_PROVIDER_ORDER' }));
} catch (error) {
  await touch();
  await report({ status: 'validation-failed' });
  console.error(error.message);
  process.exitCode = 1;
}
if (!draft) process.exit(process.exitCode ?? 0);
if (!draft.sections.length) {
  await touch();
  if (!preview && row) await queryD1({ sql: "UPDATE editorials SET payload = json_set(payload, '$.evidenceHash', ?) WHERE slug = ? AND retired_at IS NULL AND updated_at = ?", params: [digest, row.slug, row.updated_at] });
  await report({ status: 'no-material-change' });
  process.exit(0);
}

const sourceRows = [...new Set(draft.evidence.map(item => item.source))].map(i => {
  const { name, url } = documents[i - 1];
  return { name, url };
});
const payload = candidate ? {
  title: topic.title, description: draft.description.length > 180 ? draft.description.slice(0, 177).replace(/\s+\S*$/, '') + '…' : draft.description, category: 'Dinero y fútbol',
  leadHtml: draft.lead.map(paragraph).join(''), bodyHtml: sectionsHtml(draft.sections),
  visual: topic.visual, sources: sourceRows,
} : {
  ...old, updateHtml: [...(old.revisions ?? []).slice(-2), sectionsHtml(draft.sections)].join(''), revised_at: now,
  revisions: [...(old.revisions ?? []).slice(-2), sectionsHtml(draft.sections)],
  sources: [...new Map([...old.sources, ...sourceRows].map(source => [source.url, source])).values()],
};
payload.nextQuestion = draft.nextQuestion;
payload.evidenceHash = digest;

if (!preview) {
  if (candidate) {
    const { changes } = (await queryD1({
      sql: `INSERT INTO editorials (slug, position, published_at, updated_at, checked_at, payload)
        SELECT ?, (SELECT COALESCE(max(position), 0) + 1 FROM editorials), ?, ?, ?, ?
        WHERE (SELECT count(*) FROM editorials WHERE retired_at IS NULL) < ?
        ON CONFLICT(slug) DO NOTHING`,
      params: [topic.slug, now, now, now, JSON.stringify(payload), EDITORIAL_LIMIT],
    }))[0].meta;
    if (!changes) throw new Error('The editorial catalog changed while the article was prepared');
  } else {
    const { changes } = (await queryD1({
      sql: 'UPDATE editorials SET payload = ?, updated_at = ?, checked_at = ? WHERE slug = ? AND retired_at IS NULL AND updated_at = ?',
      params: [JSON.stringify(payload), now, now, row.slug, row.updated_at],
    }))[0].meta;
    if (!changes) throw new Error('The editorial changed while the update was prepared');
  }
}
await report({ status: preview ? 'preview' : 'published', draft, verifiedEvidence: draft.evidence.map(({ source, passage, claim }) => ({ source, claim, excerpt: documents[source - 1].passages[passage - 1].slice(0, 300) })), nextQuestion: draft.nextQuestion });
console.log(`${preview ? 'Validated preview' : 'Published'}: ${topic.slug}`);

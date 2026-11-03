/**
 * Published YouTube scripts for a match. The audio gate prints them as soon as
 * the match folder exists, so the recording always follows one of the approved
 * narrations instead of depending on someone remembering to ask for them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scriptBeats } from '../../src/lib/script-beats.js';

export function scriptFile(root, match) {
  return join(root, 'public/data/youtube-scripts', `${match}.json`);
}

/** Parsed script document, or null when the file is missing or unreadable. */
export function readScript(root, match) {
  const file = scriptFile(root, match);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Markdown block with every published script of the match, ready to paste in
 * the chat. Returns null when the match has no scripts.
 */
export function formatScripts(root, match, document = readScript(root, match)) {
  const scripts = Array.isArray(document?.scripts) ? document.scripts : [];
  if (!scripts.length) return null;
  const lines = [`guiones: ${scripts.length} en ${relative(root, scriptFile(root, match))}`, ''];
  for (const script of scripts) {
    const words = Number.isFinite(script.words) ? ` · ${script.words} palabras` : '';
    lines.push(`### Guion ${script.n}${words}`);
    if (script.title) lines.push(`**${script.title}**`);
    for (const beat of scriptBeats(script.narration)) lines.push(`- ${beat.label}: ${beat.text}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

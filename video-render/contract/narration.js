/** The voice reads the labeled beats as one continuous text. Legacy scripts are a string. */
export function narrationText(narration) {
  if (Array.isArray(narration)) {
    return narration.map(beat => String(beat?.text ?? '').trim()).filter(Boolean).join(' ');
  }
  return String(narration ?? '').trim();
}

/** Cola de renders: lo que se guarda mientras faltan fotos, y el texto del fallo. */

export function pendingRecord({ chatId, matchId, variant, audioFileId, script }) {
  const shot = script?.scripts?.[variant] ?? {};
  const home = String(script?.home ?? '').trim();
  const away = String(script?.away ?? '').trim();
  return {
    chatId,
    matchId,
    variant,
    matchLabel: [home, away].filter(Boolean).join(' contra '),
    title: shot.title ?? '',
    hook: shot.hook ?? '',
    narration: shot.narration ?? '',
    audioFileId,
  };
}

/** null si el manifiesto no tiene fotos para esa variante. */
export function renderRequest(record, manifest) {
  const seq = manifest?.sequences?.[record?.variant];
  if (!seq || !Array.isArray(seq.photos) || seq.photos.length < 2) return null;
  return {
    ...record,
    camera: seq.camera,
    photos: seq.photos,
    subjects: Array.isArray(seq.subjects) ? seq.subjects : [],
  };
}

/** Listo y con fotos: publicar. Si no, dejar el audio en espera. */
export function queueDecision({ ready, request }) {
  if (ready && request) return 'post';
  return 'pending';
}

/** Últimas líneas útiles del log, para el mensaje de Telegram. */
export function photoFailureText(log) {
  const lines = String(log ?? '').split('\n').map(line => line.trim()).filter(Boolean);
  const useful = lines.filter(line => /faltan fotos|visión|vision|HTTP|agnes|error|fallo|truncad/i.test(line));
  const tail = (useful.length ? useful : lines).slice(-5);
  return tail.join('\n').slice(0, 500);
}

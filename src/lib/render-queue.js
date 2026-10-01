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

/** Últimas líneas útiles del log, para el mensaje de Telegram. No dice que falten fotos. */
export function photoFailureText(log) {
  const lines = String(log ?? '').split('\n').map(line => line.trim()).filter(Boolean);
  const useful = lines.filter(line => !/faltan fotos/i.test(line) && /visión|vision|HTTP|agnes|error|fallo|truncad/i.test(line));
  const tail = (useful.length ? useful : lines.filter(line => !/faltan fotos/i.test(line))).slice(-5);
  return tail.join('\n').slice(0, 500);
}

/** Aviso al chat cuando un audio no se puede renderizar. No reenvía el archivo. */
export function audioFailureText(n, error) {
  const raw = String(error ?? '').split('\n')[0].trim();
  const corrupt = /ffmpeg|ffprobe|descarga|getFile|invalid data|moov|corrupt|ebml|ogg|no such file/i.test(raw);
  if (corrupt) return `El audio ${n} que enviaste está corrompido. Grábalo otra vez.`;
  const reason = raw.replace(/^Error:\s*/i, '').slice(0, 120);
  return reason
    ? `El audio ${n} no se pudo usar. Grábalo otra vez. ${reason}`
    : `El audio ${n} no se pudo usar. Grábalo otra vez.`;
}

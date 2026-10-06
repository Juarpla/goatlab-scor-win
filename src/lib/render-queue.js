/** Cola de renders: lo que se guarda mientras faltan fotos, y el texto del fallo. */

export function pendingRecord({ chatId, matchId, variant, audioFileId, script }) {
  const shot = script?.scripts?.[variant] ?? {};
  const home = String(script?.home ?? '').trim();
  const away = String(script?.away ?? '').trim();
  return {
    chatId,
    matchId,
    variant,
    home,
    away,
    matchLabel: [home, away].filter(Boolean).join(' contra '),
    title: shot.title ?? '',
    hook: shot.hook ?? '',
    audioFileId,
  };
}

/** null si el pool no tiene al menos dos fotos. El orden lo arma el render. */
export function renderRequest(record, manifest) {
  const assets = (Array.isArray(manifest?.assets) ? manifest.assets : []).filter(asset => asset?.url);
  if (assets.length < 2) return null;
  return {
    ...record,
    attribution: manifest.attribution ?? '',
    assets: assets.map(asset => ({
      ...asset,
      url: asset.url,
      subject: asset.subject ?? null,
      motive: asset.motive ?? null,
      query: asset.query ?? '',
    })),
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
  const useful = lines.filter(line => !/faltan fotos/i.test(line) && /HTTP|agnes|error|fallo|truncad/i.test(line));
  const tail = (useful.length ? useful : lines.filter(line => !/faltan fotos/i.test(line))).slice(-5);
  return tail.join('\n').slice(0, 500);
}

/** Aviso al chat cuando un audio no se puede renderizar. No reenvía el archivo. */
export function audioFailureText(n, error) {
  const raw = String(error ?? '').split('\n')[0].trim();
  if (/aceleraci[oó]n|acelerándolo|Graba hasta 45/i.test(raw)) return `El audio ${n} supera el límite del Short. Graba hasta 45 segundos y pide sustituir ese audio; conservaré los demás vídeos de la serie.`;
  if (/getFile|file_id|chat not found|descarga|HTTP/i.test(raw))
    return `El video ${n} no se pudo completar por un problema del servicio o de identificación. Se conserva el audio para reintentar.`;
  const corrupt = /invalid data found when processing input|moov atom not found|corrupt(?:ed)? audio/i.test(raw);
  if (corrupt) return `El audio ${n} que enviaste está corrompido. Grábalo otra vez.`;
  const reason = raw.replace(/^Error:\s*/i, '').slice(0, 120);
  return reason
    ? `El video ${n} no se pudo completar. Puedes pedir reintentarlo. ${reason}`
    : `El video ${n} no se pudo completar. Puedes pedir reintentarlo.`;
}

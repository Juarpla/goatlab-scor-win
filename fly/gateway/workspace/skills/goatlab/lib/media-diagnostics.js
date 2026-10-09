/** Bounded public diagnostics: never publish provider credentials or signed URLs. */
export function safeMediaMessage(value, env = {}) {
  let text=String(value ?? '');
  for(const [key,secret] of Object.entries(env)) if(secret && /(?:KEY|TOKEN|SECRET|PASSWORD)$/.test(key)) text=text.split(String(secret)).join('[redacted]');
  return text.replace(/https?:\/\/[^\s"<>]+/g,'[endpoint]')
    .replace(/(bearer\s+)[^\s"<>]+/gi,'$1[redacted]')
    .replace(/("(?:token|api[_-]?key|secret|authorization|password|prompt|video[_-]?id)"\s*:\s*)"[^"\n]*"/gi,'$1"[redacted]"').slice(0,4096);
}
export function publicVideoDiagnostics(rows, env={}) {
  return (Array.isArray(rows)?rows:[]).slice(-128).map(row=>({
    at: Number(row.at)||0, matchId: String(row.matchId??''), ordinal:Number(row.ordinal)||0,
    stage: safeMediaMessage(row.stage,env), code:safeMediaMessage(row.code,env),
    httpStatus: Number.isInteger(row.httpStatus)?row.httpStatus:null,
    message:safeMediaMessage(row.body,env), requestId:safeMediaMessage(row.requestId,env),
    attemptId: safeMediaMessage(row.attemptId ?? 'detalle original no conservado',env),
    next: safeMediaMessage(row.next ?? 'detalle original no conservado',env),
  }));
}
export function requestedMediaComplete({images,clips,mode}) {
  return (mode==='clips-only'||images>=4) && (mode==='images-only'||clips>=2);
}

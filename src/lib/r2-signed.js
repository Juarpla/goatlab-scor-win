import { createHash, createHmac } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Pure S3 SigV4 signer: callers supply credentials; this module never loads env. */
export function signR2({ method, key = '', bucket, account, access, secret, body = Buffer.alloc(0), bodyHash = hash(body), headers = {}, query = {}, date = new Date(), region = 'auto', host = `${account}.r2.cloudflarestorage.com`, service = 's3' }) {
  const timestamp = date.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const day = timestamp.slice(0, 8);
  const uri = `/${bucket}/${String(key).split('/').map(encode).join('/')}`;
  const qs = Object.keys(query).sort().map(k => `${encode(k)}=${encode(query[k])}`).join('&');
  const hs = { host, 'x-amz-content-sha256': bodyHash, 'x-amz-date': timestamp, ...Object.fromEntries(Object.entries(headers).map(([k,v]) => [k.toLowerCase(), String(v)])) };
  const signed = Object.keys(hs).sort().join(';');
  const block = Object.keys(hs).sort().map(k => `${k}:${hs[k].trim()}`).join('\n') + '\n';
  const scope = `${day}/${region}/${service}/aws4_request`;
  const canonical = [method, uri, qs, block, signed, bodyHash].join('\n');
  const signing = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), service), 'aws4_request');
  const signature = createHmac('sha256', signing).update(['AWS4-HMAC-SHA256', timestamp, scope, hash(canonical)].join('\n')).digest('hex');
  return { url: `https://${host}${uri}${qs ? '?' + qs : ''}`, headers: { ...hs, Authorization: `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signed}, Signature=${signature}` } };
}

import { readFile } from 'node:fs/promises';

export async function queryD1(body) {
  const { CLOUDFLARE_ACCOUNT_ID: account, GOATLAB_D1_API_TOKEN: token } = process.env;
  const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const database = process.env.GOATLAB_D1_DATABASE_ID || config.match(/"database_id":\s*"([^"]+)"/)?.[1];
  if (!account || !token || !database) throw new Error('Missing D1 configuration');
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json();
  if (!response.ok || !data.success || data.result.some(row => !row.success)) {
    throw new Error(`D1 query failed (${response.status}): ${data.errors?.map(error => error.code + ' ' + error.message).join(', ')}`);
  }
  return data.result;
}

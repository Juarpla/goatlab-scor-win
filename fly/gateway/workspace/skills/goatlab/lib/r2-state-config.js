/** GoatLab shares its S3 credentials; state always stays in its private bucket. */
export function resolveStateConfig(env = {}) {
  const separate = !!(env.R2_STATE_ACCESS_KEY_ID || env.R2_STATE_SECRET_ACCESS_KEY);
  return {
    account: env.R2_STATE_ACCOUNT_ID || env.R2_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID,
    access: separate ? env.R2_STATE_ACCESS_KEY_ID : env.R2_ACCESS_KEY_ID,
    secret: separate ? env.R2_STATE_SECRET_ACCESS_KEY : env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_STATE_BUCKET || 'app-states',
    key: env.R2_STATE_KEY || 'goatlab/agnes-state.json',
  };
}

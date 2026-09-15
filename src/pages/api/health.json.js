// On-demand endpoint (prerender = false). It keeps the Worker script-backed —
// unlocking runtime vars/secrets, bindings, logs and observability in the
// Cloudflare dashboard — while every page stays prerendered at build time.
// Also serves as an uptime/freshness probe for the deployed site.
export const prerender = false;

export function GET() {
  return Response.json({ ok: true });
}

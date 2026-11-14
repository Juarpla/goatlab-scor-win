// Worker uptime probe. Calendar checks also exercise the D1-backed pages.
export const prerender = false;

export function GET() {
  return Response.json({ ok: true });
}

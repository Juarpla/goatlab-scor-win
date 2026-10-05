import { contentIndex } from '../lib/content-store.js';
export function GET() {
  return new Response(JSON.stringify(contentIndex()), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

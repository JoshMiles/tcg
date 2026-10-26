import { NextRequest, NextResponse } from 'next/server';

// Receives Content-Security-Policy-Report-Only violation reports (lib/security-headers.ts) and writes one log line each; read them in
// Vercel -> Logs by searching "csp-violation" (docs/hosting.md). Public on purpose: browsers post it with no cookies or credentials.
// Capped, not stored: bodies over 8 KB are dropped, and at most 60 lines a minute are logged per server instance.
const MAX_BYTES = 8192;
const MAX_PER_MINUTE = 60;
let windowStart = 0;
let logged = 0;

export async function POST(req: NextRequest) {
  const done = new NextResponse(null, { status: 204 });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) return done;
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; logged = 0; }
  if (logged >= MAX_PER_MINUTE) return done;
  const text = (await req.text().catch(() => '')).slice(0, MAX_BYTES);
  let report: Record<string, unknown> | undefined;
  try { report = (JSON.parse(text) as Record<string, Record<string, unknown>>)['csp-report']; } catch { /* not a report */ }
  if (!report || typeof report !== 'object') return done;
  logged++;
  const s = (k: string) => (typeof report![k] === 'string' ? (report![k] as string).slice(0, 300) : undefined);
  console.warn('csp-violation', JSON.stringify({
    directive: s('effective-directive') ?? s('violated-directive'),
    blocked: s('blocked-uri'),
    page: s('document-uri'),
    source: s('source-file'),
    line: report['line-number'],
  }));
  return done;
}

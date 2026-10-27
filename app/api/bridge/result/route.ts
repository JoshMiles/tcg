import { NextResponse } from 'next/server';
import { bridgeGuard, storeResult } from '@/lib/bridge';

/** TCG Bridge reports how a job went: `{ id, ok, balance?, users?, error? }`. The call waiting on that id reads it. */
export async function POST(req: Request) {
  const g = await bridgeGuard(req);
  if (!g.ok) return g.response;
  const body = await req.json().catch(() => null);
  const stored = await storeResult(body);
  if (stored === 'bad') return NextResponse.json({ error: 'Send { id, ok, balance?, users?, error? }.' }, { status: 400 });
  if (stored === 'late') return NextResponse.json({ error: 'Too late: the site gave up on this job', late: true }, { status: 409 });
  return NextResponse.json({ ok: true });
}

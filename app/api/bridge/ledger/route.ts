import { NextResponse } from 'next/server';
import { bridgeGuard } from '@/lib/bridge';
import { receiveLedger } from '@/lib/bridge-chat';

/**
 * TCG Bridge posts its Brie Bucks ledger `{ entries: [{ id, user, amount, at, answer }] }` after the site asked for it at the end of a
 * stream (ROADMAP 55.10). The site compares it with its own record of charges and refunds, once per stream; `compared` says whether it did.
 */
export async function POST(req: Request) {
  const g = await bridgeGuard(req);
  if (!g.ok) return g.response;
  const body = (await req.json().catch(() => null)) as { entries?: unknown } | null;
  if (!body || !Array.isArray(body.entries)) return NextResponse.json({ error: 'Send { entries: [...] }.' }, { status: 400 });
  return NextResponse.json({ ok: true, compared: await receiveLedger(body.entries) });
}

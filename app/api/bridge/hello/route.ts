import { NextResponse } from 'next/server';
import { bridgeGuard, storeHello } from '@/lib/bridge';

/** TCG Bridge announces itself on start: `{ version, currencies: [{ id, name }] }`, which fills the currency select on the Mix It Up page. */
export async function POST(req: Request) {
  const g = await bridgeGuard(req);
  if (!g.ok) return g.response;
  const body = await req.json().catch(() => null);
  if (!(await storeHello(body))) return NextResponse.json({ error: 'Send { version, currencies: [{ id, name }] }.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}

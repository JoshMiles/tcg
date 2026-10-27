import { NextResponse } from 'next/server';
import { bridgeGuard, storeHello } from '@/lib/bridge';
import { getMixItUpSettings } from '@/lib/mixitup';
import { CHANNEL_NAME } from '@/lib/site';

/** TCG Bridge announces itself on start: `{ version, currencies: [{ id, name }] }`, which fills the currency select on the Mix It Up page. The answer carries the channel name (the app prefills its balance test with it) and the chosen currency's id (the app's "Test Mix It Up"). */
export async function POST(req: Request) {
  const g = await bridgeGuard(req);
  if (!g.ok) return g.response;
  const body = await req.json().catch(() => null);
  if (!(await storeHello(body))) return NextResponse.json({ error: 'Send { version, currencies: [{ id, name }] }.' }, { status: 400 });
  return NextResponse.json({ ok: true, channel: CHANNEL_NAME, currencyId: (await getMixItUpSettings()).currencyId });
}

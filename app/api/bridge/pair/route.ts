import { NextResponse } from 'next/server';
import { pairBridge, pairGuard } from '@/lib/bridge';
import { recordAudit } from '@/lib/audit';

/** TCG Bridge swaps a one-time code (made on the Mix It Up page) for its token. The token is shown once; only its hash is kept. */
export async function POST(req: Request) {
  const limited = await pairGuard(req);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const paired = await pairBridge(body.code, body.name);
  if (!paired) return NextResponse.json({ error: 'That code is wrong or has expired.' }, { status: 401 });
  await recordAudit('everyone', 'TCG Bridge paired', paired.name);
  return NextResponse.json({ token: paired.token });
}

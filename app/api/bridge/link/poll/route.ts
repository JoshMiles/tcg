import { NextResponse } from 'next/server';
import { linkGuard } from '@/lib/bridge';
import { pollLink } from '@/lib/bridge-link';

/** TCG Bridge polls its link request every 2 s: body `{ id, secret }`. Answers `{ status: 'pending' | 'expired' }`, `{ status: 'denied', message }` or `{ status: 'allowed', token, login, role }` (once). */
export async function POST(req: Request) {
  const limited = await linkGuard(req, 'bridge-link-poll');
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await pollLink(body.id, body.secret), { headers: { 'Cache-Control': 'no-store' } });
}

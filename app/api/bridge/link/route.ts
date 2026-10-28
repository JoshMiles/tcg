import { NextResponse } from 'next/server';
import { linkGuard } from '@/lib/bridge';
import { createLink } from '@/lib/bridge-link';

/** TCG Bridge starts "Sign in with Twitch" (58.0): body `{ name }` (the PC name). Answers `{ id, code, secret, url, expiresAt }`; the secret is only ever shown here. No token needed. */
export async function POST(req: Request) {
  const limited = await linkGuard(req, 'bridge-link');
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(await createLink(body.name), { headers: { 'Cache-Control': 'no-store' } });
}

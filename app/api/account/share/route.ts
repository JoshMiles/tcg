import { siteClosedResponse } from '@/lib/access';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, isSameOrigin } from '@/lib/session';
import { postShareImage, SHARE_MAX_BYTES } from '@/lib/discord';
import { getUserProfile } from '@/lib/kv';

// The logged-in collector posts the share image they just drew. Who they are comes from the session, never the body.
export async function POST(req: NextRequest) {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Log in with Twitch first.' }, { status: 401 });
  const claimed = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(claimed) && claimed > SHARE_MAX_BYTES) return NextResponse.json({ error: 'That image is too large to post.' }, { status: 400 });
  const buf = await req.arrayBuffer().catch(() => null);
  if (!buf) return NextResponse.json({ error: 'Send a PNG image.' }, { status: 400 });
  const profile = await getUserProfile(session.username).catch(() => null);
  const result = await postShareImage(session.username, new Uint8Array(buf), profile?.displayName);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error.includes('minute') ? 429 : 400 });
  return NextResponse.json({ ok: true });
}

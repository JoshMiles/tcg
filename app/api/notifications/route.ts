import { siteClosedResponse } from '@/lib/access';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, isSameOrigin } from '@/lib/session';
import { getNoticeVersion, listNotices, markNoticesSeen } from '@/lib/trade-notify';
import { getUserSettings } from '@/lib/user-settings-store';
import { isUnchanged, parseSince } from '@/lib/notice-poll-core';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

// The logged-in viewer's notifications (trade offers and outcomes). The viewer always comes from the session.
// `?since=<v>` is the version the caller already has: 204 when nothing has changed since.
export async function GET(req: NextRequest) {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  const session = await getSession();
  if (!session) return NextResponse.json({ notices: [], seen: 0, unread: 0, v: 0, sound: false }, { headers: NO_STORE });
  // Read the version first: a notice that lands while we read the list then shows as a newer version on the next poll.
  const v = await getNoticeVersion(session.username);
  if (isUnchanged(parseSince(req.nextUrl.searchParams.get('since')), v)) return new NextResponse(null, { status: 204, headers: NO_STORE });
  const [{ notices, seen }, settings] = await Promise.all([listNotices(session.username), getUserSettings(session.username.toLowerCase()).catch(() => null)]);
  return NextResponse.json({ notices, seen, unread: notices.filter(n => n.at > seen).length, v, sound: !!settings?.noticeSound }, { headers: NO_STORE });
}

/** Marks everything as read. */
export async function POST(req: NextRequest) {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  await markNoticesSeen(session.username);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { getSession, isSameOrigin } from '@/lib/session';
import { listNotices, markNoticesSeen } from '@/lib/trade-notify';

export const dynamic = 'force-dynamic';

// The logged-in viewer's notifications (trade offers and outcomes). The viewer always comes from the session.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ notices: [], seen: 0, unread: 0 }, { headers: { 'Cache-Control': 'no-store' } });
  const { notices, seen } = await listNotices(session.username);
  return NextResponse.json({ notices, seen, unread: notices.filter(n => n.at > seen).length }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Marks everything as read. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  await markNoticesSeen(session.username);
  return NextResponse.json({ ok: true });
}

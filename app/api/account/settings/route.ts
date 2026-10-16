import { siteClosedResponse } from '@/lib/access';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, isSameOrigin } from '@/lib/session';
import { getUserSettings, saveUserSettings } from '@/lib/user-settings-store';

export const dynamic = 'force-dynamic';

// The logged-in viewer's own settings. Who they are comes from the signed session, never the body; the body is re-validated
// by sanitizeUserSettings (unknown keys dropped, ranges clamped).
export async function GET() {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Log in with Twitch first.' }, { status: 401 });
  return NextResponse.json({ settings: await getUserSettings(session.username) });
}

export async function POST(req: NextRequest) {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Log in with Twitch first.' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send the settings as JSON.' }, { status: 400 });
  try {
    return NextResponse.json({ settings: await saveUserSettings(session.username, body) });
  } catch {
    return NextResponse.json({ error: 'Could not save right now. Try again.' }, { status: 503 });
  }
}

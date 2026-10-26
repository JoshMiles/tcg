import { NextRequest, NextResponse } from 'next/server';
import { requireViewer } from '@/lib/trade-api';
import { captchaGate } from '@/lib/captcha-server';
import { cancelDeletion, requestDeletion } from '@/lib/feedback';

// Ask for the account to be deleted. The request goes into the feedback inbox and an admin does the deleting (ROADMAP 11.3).
// The viewer has to type their own login, and passes the same quick check as a trade.
export async function POST(req: NextRequest) {
  const viewer = await requireViewer(req);
  if ('response' in viewer) return viewer.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const blocked = await captchaGate(req, viewer.session.username, body);
  if (blocked) return blocked;
  const typed = typeof body.confirm === 'string' ? body.confirm.trim().replace(/^@/, '').toLowerCase() : '';
  if (typed !== viewer.session.username.toLowerCase()) return NextResponse.json({ error: 'Type your login name exactly to confirm.' }, { status: 400 });
  try {
    const result = await requestDeletion(viewer.session.username);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true, at: result.item.at });
  } catch {
    return NextResponse.json({ error: 'Could not send that right now. Try again in a moment.' }, { status: 503 });
  }
}

// Take the request back while it is still waiting.
export async function DELETE(req: NextRequest) {
  const viewer = await requireViewer(req);
  if ('response' in viewer) return viewer.response;
  const cancelled = await cancelDeletion(viewer.session.username).catch(() => false);
  return NextResponse.json({ ok: true, cancelled });
}

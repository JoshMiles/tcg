import { siteClosedResponse } from '@/lib/access';
import { NextRequest, NextResponse } from 'next/server';
import { requireViewer, serverError } from '@/lib/trade-api';
import { captchaGate } from '@/lib/captcha-server';
import { parseFeedbackInput } from '@/lib/feedback-core';
import { submitFeedback } from '@/lib/feedback';

// Send a suggestion or problem report. Signed in only, Turnstile like trades, 5 a day per viewer. Who sent it comes from the session.
export async function POST(req: NextRequest) {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  const viewer = await requireViewer(req);
  if ('response' in viewer) return viewer.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const blocked = await captchaGate(req, viewer.session.username, body);
  if (blocked) return blocked;
  const parsed = parseFeedbackInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const result = await submitFeedback(viewer.session.username, parsed.value, body.device);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, id: result.item.id });
  } catch (e) {
    return serverError(e, 'feedback', 'Could not send that right now. Try again in a moment.');
  }
}

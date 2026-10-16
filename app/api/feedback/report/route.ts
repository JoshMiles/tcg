import { siteClosedResponse } from '@/lib/access';
import { NextRequest, NextResponse } from 'next/server';
import { requireViewer } from '@/lib/trade-api';
import { captchaGate } from '@/lib/captcha-server';
import { parseReportInput } from '@/lib/feedback-core';
import { submitReport } from '@/lib/feedback';
import { staffPanelLink } from '@/lib/staff-guard';

export const dynamic = 'force-dynamic';

// Report another viewer from their profile. Signed in only, Turnstile like trades, 5 a day, one open report per target.
// Who reported comes from the session and is only ever shown to staff. Staff use their own tools instead of reporting.
export async function POST(req: NextRequest) {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  const viewer = await requireViewer(req);
  if ('response' in viewer) return viewer.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const blocked = await captchaGate(req, viewer.session.username, body);
  if (blocked) return blocked;
  const parsed = parseReportInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (await staffPanelLink(viewer.session).catch(() => null)) return NextResponse.json({ error: 'Staff can use the admin tools instead of reporting.' }, { status: 403 });
  try {
    const result = await submitReport(viewer.session.username, parsed.value);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Could not send that right now. Try again in a moment.' }, { status: 503 });
  }
}

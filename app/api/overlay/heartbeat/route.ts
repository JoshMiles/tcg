import { NextRequest, NextResponse } from 'next/server';
import { recordHeartbeat, isValidClientId } from '@/lib/overlay';
import { getReloadSignal } from '@/lib/overlay-settings';
import { isOverlayRequest } from '@/lib/overlay-key';

// The OBS overlay (public/widget.js) pings this every ~10s so the admin can see it is open.
// Needs the overlay key (or a staff session), so nobody can fake an open overlay; it also only accepts a tiny, validated payload.
export async function POST(req: NextRequest) {
  if (!(await isOverlayRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isValidClientId(body.id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const flag = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

  await recordHeartbeat({
    id: body.id,
    streaming: flag(body.streaming),
    recording: flag(body.recording),
    obs: body.obs === true,
    dev: body.dev === true,
  });
  // `reload` changes when an admin asks connected overlays to refresh (see Overlay Editor); the widget reloads once idle.
  return NextResponse.json({ ok: true, reload: await getReloadSignal() });
}

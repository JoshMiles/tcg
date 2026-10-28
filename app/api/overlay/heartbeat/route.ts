import { NextRequest, NextResponse } from 'next/server';
import { recordHeartbeat, isValidClientId } from '@/lib/overlay';
import { getReloadSignal } from '@/lib/overlay-settings';
import { isOverlayRequest } from '@/lib/overlay-key';
import { bridgePullReveal } from '@/lib/bridge';
import { readPackGoal } from '@/lib/pack-goal';

// The OBS overlay (public/widget.js) pings this every ~10s so the admin can see it is open.
// Needs the overlay key (or a staff session), so nobody can fake an open overlay; it also only accepts a tiny, validated payload.
export async function POST(req: NextRequest) {
  if (!(await isOverlayRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isValidClientId(body.id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  // The reveal report (ROADMAP 55.8): `{ id, reveal: <event id from the save> }` when a pull's card is shown. Not a heartbeat, so it records nothing about this client.
  if (typeof body.reveal === 'string') {
    return NextResponse.json({ ok: true, queued: isValidClientId(body.reveal) && (await bridgePullReveal(body.reveal)) });
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
  // `goal` (ROADMAP 57.5) is sent only to an overlay that has a Pack goal layer and asked for it (`goal: true`), so no other overlay costs a read.
  const goal = body.goal === true ? await readPackGoal() : undefined;
  return NextResponse.json({ ok: true, reload: await getReloadSignal(), ...(goal !== undefined ? { goal: goal ? { label: goal.goal.label, count: Math.min(goal.count, goal.goal.target), target: goal.goal.target } : null } : {}) });
}

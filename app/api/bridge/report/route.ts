import { NextResponse } from 'next/server';
import { bridgeGuard, storeObs } from '@/lib/bridge';
import { setLiveFromBridge } from '@/lib/twitch-live';
import { cleanObs } from '@/lib/bridge-core';
import { overlayWatchdog } from '@/lib/overlay-watchdog';

/**
 * TCG Bridge reports what it sees in OBS (ROADMAP 55.6b): `{ type: 'stream', live }` when the stream output starts or stops, and
 * `{ type: 'obs', connected, scene, overlay: { found, inProgram, visible, sourceName } }` for the overlay check.
 */
export async function POST(req: Request) {
  const g = await bridgeGuard(req);
  if (!g.ok) return g.response;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.type === 'stream' && typeof body.live === 'boolean') {
    const changed = await setLiveFromBridge(body.live);
    return NextResponse.json({ ok: true, live: body.live, changed });
  }
  if (body?.type === 'obs' && (await storeObs(body))) {
    const snap = cleanObs(body);
    if (snap) await overlayWatchdog(snap); // the overlay watchdog (55.8) rides on this report; it never throws
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Send { type: "stream", live } or { type: "obs", connected, scene, overlay }.' }, { status: 400 });
}

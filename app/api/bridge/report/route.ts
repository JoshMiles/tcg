import { NextResponse } from 'next/server';
import { bridgeGuard, setFeedOn, storeObs } from '@/lib/bridge';
import { noteUptime } from '@/lib/bridge-uptime';
import { storeChecklist } from '@/lib/bridge-checklist';
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
    if (snap) { await noteUptime('obs', snap.connected); await overlayWatchdog(snap); } // the uptime history (55.11) and the overlay watchdog (55.8) ride on this report; neither throws
    return NextResponse.json({ ok: true });
  }
  // The app's own state (55.11): whether Mix It Up answers it (for the uptime history) and whether its live pull feed window is open.
  if (body?.type === 'mix' && typeof body.found === 'boolean') {
    await noteUptime('mix', body.found);
    return NextResponse.json({ ok: true });
  }
  if (body?.type === 'feed' && typeof body.on === 'boolean') {
    await setFeedOn(body.on);
    return NextResponse.json({ ok: true });
  }
  if (body?.type === 'checklist' && (await storeChecklist(body))) return NextResponse.json({ ok: true }); // the pre-stream checklist's result (57.1)
  return NextResponse.json({ error: 'Send { type: "stream", live }, { type: "obs", connected, scene, overlay }, { type: "mix", found }, { type: "feed", on } or { type: "checklist", lines }.' }, { status: 400 });
}

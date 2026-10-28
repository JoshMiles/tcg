import { NextResponse } from 'next/server';
import { bridgeGuard } from '@/lib/bridge';
import { runBridgeAction } from '@/lib/bridge-actions';

/** TCG Bridge asks the site to do one thing from the PC (ROADMAP 55.9): `{ action: 'buff' | 'last-buff' | 'pause' | 'pause-awards' | 'scene-pause' | 'happy-hour-start' | 'happy-hour-end' | 'refresh' | 'skip' | 'clear-queue' | 'status' | 'stats', ... }`. */
export async function POST(req: Request) {
  const g = await bridgeGuard(req);
  if (!g.ok) return g.response;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  return NextResponse.json(await runBridgeAction(body ?? {}, g.pc));
}

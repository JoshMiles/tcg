import { NextResponse } from 'next/server';
import { bridgeGuard } from '@/lib/bridge';
import { readQueue } from '@/lib/queue-control';

/** The overlay queue for TCG Bridge's window (ROADMAP 55.9): who is waiting, which pack and for how long, the next one first. */
export async function GET(req: Request) {
  const g = await bridgeGuard(req);
  if (!g.ok) return g.response;
  return NextResponse.json({ rows: await readQueue() });
}

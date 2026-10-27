import { NextRequest, NextResponse } from 'next/server';
import { bridgeStaffGuard } from '@/lib/bridge';
import { runStaffAction, runStaffRead } from '@/lib/bridge-staff';

// TCG Bridge's Staff tab (ROADMAP 55.12). POST runs one fixed staff action, GET reads what the tab shows (?what=state|users|cards|viewer&q=).
// Only a PC whose "Staff tools on this PC" switch is on gets past the guard; everything else is a 403. See lib/bridge-staff.ts.
export async function POST(req: NextRequest) {
  const g = await bridgeStaffGuard(req);
  if (!g.ok) return g.response;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 });
  return NextResponse.json(await runStaffAction(g.pc, body as Record<string, unknown>));
}

export async function GET(req: NextRequest) {
  const g = await bridgeStaffGuard(req);
  if (!g.ok) return g.response;
  const p = new URL(req.url).searchParams;
  return NextResponse.json(await runStaffRead(p.get('what'), (p.get('q') ?? '').slice(0, 80)));
}

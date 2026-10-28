import { NextResponse } from 'next/server';
import { bridgeGuard } from '@/lib/bridge';
import { checklistFacts } from '@/lib/bridge-checklist';

/** What TCG Bridge's pre-stream checklist needs from the site (ROADMAP 57.1): the active season, how many packs can be opened, the pull queue, pause and happy hour. Read only, no staff switch needed. The app's result goes back through /api/bridge/report. */
export async function GET(req: Request) {
  const g = await bridgeGuard(req);
  if (!g.ok) return g.response;
  return NextResponse.json(await checklistFacts());
}

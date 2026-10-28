import { NextResponse } from 'next/server';
import { bridgeGuard, pollJobs } from '@/lib/bridge';
import { isStaffPc } from '@/lib/bridge-core';
import { noteDeploy } from '@/lib/bridge-notice';
import { getBuildInfo } from '@/lib/version';

export const maxDuration = 40; // the long-poll holds the request up to 25 s

/** TCG Bridge asks for work: answers `{ jobs }` as soon as there are any, else empty after 25 s. A job is handed out once. */
export async function POST(req: Request) {
  const g = await bridgeGuard(req);
  if (!g.ok) return g.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (process.env.VERCEL_ENV === 'production') await noteDeploy(getBuildInfo()); // a poll is where a new build is first seen (ROADMAP 55.13)
  const jobs = await pollJobs(g.hash, typeof body.version === 'string' ? body.version.slice(0, 40) : undefined, isStaffPc(g.pc) ? g.pc.id : undefined);
  return jobs ? NextResponse.json({ jobs }) : NextResponse.json({ error: 'Unknown token' }, { status: 401 });
}

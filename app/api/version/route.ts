import { NextResponse, connection } from 'next/server';
import { getBuildInfo } from '@/lib/version';

// Public on purpose: the Twitch panel (a static page) shows this so you can tell which deployment
// a viewer is looking at. Only exposes version + commit + environment, nothing sensitive.
export async function GET() {
  await connection();
  const { version, commit, branch, env, builtAt } = getBuildInfo();
  return NextResponse.json(
    { version, commit, branch, env, builtAt },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

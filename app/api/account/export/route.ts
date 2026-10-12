import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { buildExport } from '@/lib/user-export';

export const dynamic = 'force-dynamic';

// Everything the game stores about the logged-in viewer, as a download.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Log in with Twitch first.' }, { status: 401 });
  const data = await buildExport(session.username);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="cheesy-tcg-${session.username}.json"`,
      'cache-control': 'no-store',
    },
  });
}

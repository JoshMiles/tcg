import { NextRequest, NextResponse } from 'next/server';
import { hasStaffCapability } from '@/lib/staff-guard';
import { getActivity } from '@/lib/activity';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';

// Polled by the live activity page: GET /api/admin/activity?after=<seq>
// Returns events newer than `seq` (newest first), the current seq, and avatars for those users.
// When nothing is new this is a single KV read. (/api/admin/* isn't covered by the panel middleware, so this checks for itself; mods may read it.)
export async function GET(req: NextRequest) {
  if (!(await hasStaffCapability('mod'))) { // mods watch the feed too
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const afterParam = req.nextUrl.searchParams.get('after');
  const after = afterParam !== null && /^\d+$/.test(afterParam) ? Number(afterParam) : undefined;

  const { events, seq } = await getActivity({ after, limit: 100, includeTest: true });

  const raw = events.length > 0 ? await getAvatars(events.map(e => e.username)) : {};
  const avatars = Object.fromEntries(Object.entries(raw).map(([u, url]) => [u, sizeTwitchAvatar(url, 70)]));

  return NextResponse.json({ events, seq, avatars }, { headers: { 'Cache-Control': 'no-store' } });
}

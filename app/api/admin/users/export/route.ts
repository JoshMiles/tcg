import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { loadUserRows } from '@/lib/users-rows';
import { parseUsersQuery, filterSortUsers, usersCsv } from '@/lib/users-list';

// GET /api/admin/users/export?<the Users page's search params>[&only=a,b]: the whole filtered list as CSV (not just the visible page),
// or just the ticked viewers when `only` is given. Admin only (this route checks for itself, /api/admin/* isn't covered by the middleware).
export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const only = new Set((sp.only ?? '').split(',').filter(Boolean));
  const { rows } = await loadUserRows();
  const list = filterSortUsers(rows, parseUsersQuery(sp), Date.now()).filter(r => only.size === 0 || only.has(r.username));
  return new NextResponse(usersCsv(list), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="viewers-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

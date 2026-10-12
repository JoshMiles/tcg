import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getAllCollectionUsers, listAllPacks, listSeasons } from '@/lib/kv';
import type { PaletteItem } from '@/lib/palette';

export const dynamic = 'force-dynamic';

const MAX_USERS = 600;

// The command palette's searchable records: packs, seasons and viewers. (/api/admin/* isn't covered by the /admin middleware,
// so check explicitly.) Runs through `kv`, so inside a sandbox it lists the sandbox's records.
export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [packs, seasons, users] = await Promise.all([
    listAllPacks().catch(() => []), listSeasons().catch(() => []), getAllCollectionUsers().catch(() => []),
  ]);
  const items: PaletteItem[] = [
    ...packs.map(p => ({ id: `pack:${p.id}`, label: p.name, group: 'Packs' as const, icon: 'cards' as const, href: `/admin/packs/${p.id}`, hint: p.status === 'draft' ? 'Draft pack' : p.archived ? 'Archived pack' : 'Pack' })),
    ...seasons.map(s => ({ id: `season:${s.id}`, label: s.name, group: 'Seasons' as const, icon: 'trophy' as const, href: `/admin/seasons/${s.id}`, hint: s.active ? 'Active season' : s.status === 'draft' ? 'Draft season' : 'Season' })),
    ...users.slice(0, MAX_USERS).map(u => ({ id: `user:${u.username}`, label: u.username, group: 'Users' as const, icon: 'user' as const, href: `/admin/users/${encodeURIComponent(u.username)}`, hint: 'Viewer' })),
  ];
  return NextResponse.json({ items, truncated: users.length > MAX_USERS }, { headers: { 'Cache-Control': 'no-store' } });
}

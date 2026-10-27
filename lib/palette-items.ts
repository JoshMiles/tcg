import { getAllCollectionUsers, listAllPacks, listSeasons } from './kv';
import type { PaletteItem } from './palette';

const MAX_USERS = 600;

/** The command palette's searchable records: packs, seasons and viewers (also what TCG Bridge's quick search looks through). Goes through `kv`, so inside a sandbox it lists the sandbox's records. */
export async function paletteRecords(): Promise<{ items: PaletteItem[]; truncated: boolean }> {
  const [packs, seasons, users] = await Promise.all([
    listAllPacks().catch(() => []), listSeasons().catch(() => []), getAllCollectionUsers().catch(() => []),
  ]);
  const items: PaletteItem[] = [
    ...packs.map(p => ({ id: `pack:${p.id}`, label: p.name, group: 'Packs' as const, icon: 'cards' as const, href: `/admin/packs/${p.id}`, hint: p.status === 'draft' ? 'Draft pack' : p.archived ? 'Archived pack' : 'Pack' })),
    ...seasons.map(s => ({ id: `season:${s.id}`, label: s.name, group: 'Seasons' as const, icon: 'trophy' as const, href: `/admin/seasons/${s.id}`, hint: s.active ? 'Active season' : s.status === 'draft' ? 'Draft season' : 'Season' })),
    ...users.slice(0, MAX_USERS).map(u => ({ id: `user:${u.username}`, label: u.username, group: 'Users' as const, icon: 'user' as const, href: `/admin/users/${encodeURIComponent(u.username)}`, hint: 'Viewer' })),
  ];
  return { items, truncated: users.length > MAX_USERS };
}

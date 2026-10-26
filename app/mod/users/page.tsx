import Link from 'next/link';
import { Avatar } from '@/app/components/Avatar';
import { Icon } from '@/app/components/Icon';
import { getAllCollectionUsers, getUserProfiles } from '@/lib/kv';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import type { UserProfile } from '@/lib/types';
import { uniqueCount } from '@/lib/collection';
import { requireStaff } from '@/lib/staff-guard';
import { Chip, EmptyState, PageHeader, fieldClass } from '../../admin/components/ui';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Viewers · Mod', robots: { index: false } };

const SHOWN = 80;

/** Find a viewer to look at or moderate. `?q=` searches by name; "Restricted" lists people who are blocked from trading or hidden. */
export default async function ModUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  await requireStaff('mod');
  const { q = '', show } = await searchParams;
  const needle = q.trim().toLowerCase().replace(/^@/, '');
  const restrictedOnly = show === 'restricted';

  const all = await getAllCollectionUsers();
  const pool = (needle ? all.filter(u => u.username.includes(needle)) : [...all]).sort((a, b) => a.username.localeCompare(b.username));
  // Profiles are read for the rows that decide the list: all of them for "Restricted only" (no index to start from), else just the page.
  const candidates = restrictedOnly ? pool : pool.slice(0, SHOWN);
  const profiles = await getUserProfiles(candidates.map(u => u.username)).catch(() => new Map<string, UserProfile | null>());
  const rows = candidates.map(u => ({ u, p: profiles.get(u.username) ?? null })).filter(r => !restrictedOnly || r.p?.flags?.noTrading || r.p?.flags?.hideFromBoard);
  const total = restrictedOnly ? rows.length : pool.length;
  const shown = rows.slice(0, SHOWN);
  const avatars = await getAvatars(shown.map(r => r.u.username));

  return (
    <div className="space-y-6">
      <PageHeader title="Viewers" subtitle="Look a viewer up, see their trades, and restrict or tag them." />
      <form method="GET" className="flex flex-wrap items-center gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Search by Twitch name" aria-label="Search viewers" className={`${fieldClass} max-w-xs`} />
        <select name="show" defaultValue={show ?? ''} aria-label="Show" className="select">
          <option value="">Everyone</option><option value="restricted">Restricted only</option>
        </select>
        <button type="submit" className="btn btn-primary px-4 py-2 text-sm rounded-xl"><Icon name="search" className="mr-1.5" />Search</button>
      </form>

      {shown.length === 0 ? (
        <EmptyState icon="users" title="No viewers found">{needle ? `Nobody matches "${q}".` : 'Nothing to show.'}</EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-gray-800/60 rounded-2xl border border-gray-800 bg-gray-900/40 overflow-hidden">
            {shown.map(({ u, p }) => {
              const unique = u.seasons.reduce((s, x) => s + uniqueCount(x.cards), 0);
              const av = avatars[u.username];
              return (
                <li key={u.username}>
                  <Link href={`/mod/users/${encodeURIComponent(u.username)}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-white/3">
                    <Avatar src={av ? sizeTwitchAvatar(av, 70) : undefined} name={p?.displayName || u.username} className="w-9 h-9 text-sm shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-semibold text-white truncate">{p?.displayName || u.username}</span>
                      <span className="block text-xs text-gray-500">@{u.username} · {unique} collected</span>
                    </span>
                    <span className="ml-auto flex flex-wrap items-center gap-1.5">
                      {p?.flags?.noTrading && <Chip tone="red">No trading</Chip>}
                      {p?.flags?.hideFromBoard && <Chip tone="amber">Hidden from boards</Chip>}
                      {(p?.tags ?? []).slice(0, 3).map(t => <Chip key={t}>{t}</Chip>)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-gray-600">{total > SHOWN ? `Showing the first ${SHOWN} of ${total}. Search to narrow it down.` : `${total} viewer${total === 1 ? '' : 's'}.`}</p>
        </>
      )}
    </div>
  );
}

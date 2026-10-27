import { staffPage } from '@/lib/staff-guard';
import { Icon } from '@/app/components/Icon';
import { loadUserRows } from '@/lib/users-rows';
import { parseUsersQuery, filterSortUsers, pageOfUsers } from '@/lib/users-list';
import { resetAllUsers } from '../actions/users';
import { ConfirmButton } from '../components/ConfirmButton';
import { UsersList } from './UsersList';
import { Tile, EmptyState } from '../components/ui';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Users · Admin', robots: { index: false } };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await staffPage('admin');
  const query = parseUsersQuery(await searchParams);
  const { rows, active } = await loadUserRows();
  const now = Date.now();
  const newThisWeek = rows.filter(r => r.joined && now - r.joined < 7 * 86_400_000).length;
  const active24 = rows.filter(r => r.lastActive && now - r.lastActive < 86_400_000).length;
  const active7 = rows.filter(r => r.lastActive && now - r.lastActive < 7 * 86_400_000).length;
  const dormant = rows.filter(r => r.lastActive && now - r.lastActive > 30 * 86_400_000).length;
  const complete = rows.filter(r => r.primary && r.primary.total > 0 && r.primary.owned >= r.primary.total).length;
  const restricted = rows.filter(r => r.noTrading || r.hidden).length;
  const allTags = [...new Set(rows.flatMap(r => r.tags))].sort();
  const matches = filterSortUsers(rows, query, now);
  const view = pageOfUsers(matches, query.page);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{rows.length} collector{rows.length !== 1 ? 's' : ''} across all seasons · click a row to manage them</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/collection" target="_blank" className="px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors">↗ Collection Page</a>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Tile label="Viewers" value={rows.length} />
          <Tile label="New this week" value={newThisWeek} />
          <Tile label="Active today" value={active24} sub={`${active7} in 7 days`} />
          <Tile label="Dormant" value={dormant} sub="not seen for 30+ days" />
          <Tile label="Complete" value={complete} sub={active ? `in ${active.name}` : undefined} />
          <Tile label="Restricted" value={restricted} sub={restricted > 0 ? 'blocked or hidden' : 'none'} />
        </div>
      )}

      <div className="card rounded-2xl overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon="users" title="No collectors yet">Viewers appear here when they pull cards on stream.</EmptyState>
        ) : (
          <UsersList rows={view.items} query={query} matches={matches.length} total={rows.length} page={view.page} pages={view.pages} allTags={allTags} activeSeason={active?.name ?? null} />
        )}
      </div>

      {rows.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 p-4 space-y-3">
          <h2 className="text-sm font-bold text-red-400">Danger zone</h2>
          <p className="text-xs text-gray-500">Wipes every viewer&apos;s cards in every season. There is no restore point for a reset of everyone.</p>
          <form action={resetAllUsers}>
            <ConfirmButton
              title="Reset ALL collections?"
              confirmLabel="Reset everyone"
              typeToConfirm="reset everyone"
              message={<>This wipes <strong className="text-white">every viewer&apos;s cards in every season</strong> ({rows.length} collector{rows.length !== 1 ? 's' : ''}). There is no restore point for a reset of everyone, so this can&apos;t be undone.</>}
              className="px-3.5 py-2 text-sm font-bold text-red-400 hover:text-red-200 hover:bg-red-950/50 border border-red-500/30 rounded-xl transition-colors"
            >
              Reset all
            </ConfirmButton>
          </form>
        </div>
      )}
    </div>
  );
}

import { ADMIN_CHANGELOG, CHANGELOG, MOD_CHANGELOG } from '@/lib/changelog';
import { ChangelogList } from '@/app/components/ChangelogList';
import { REPO_URL } from '@/lib/site';
import { PageTabs, pickTab, type PageTab } from '../components/PageTabs';
import { EmptyState, PageHeader } from '../components/ui';

export const metadata = { title: "What's new · Admin", robots: { index: false } };
export const dynamic = 'force-dynamic';

const TABS: PageTab[] = [
  { id: 'admin', label: 'Admin', icon: 'shield', count: ADMIN_CHANGELOG.length },
  { id: 'mod', label: 'Mod', icon: 'users', count: MOD_CHANGELOG.length },
  { id: 'players', label: 'Players', icon: 'sparkles', count: CHANGELOG.length },
];
const LISTS = { admin: ADMIN_CHANGELOG, mod: MOD_CHANGELOG, players: CHANGELOG };

/** What's new for the admin panel, the mod panel and players (the admin layout already checks the staff role). */
export default async function AdminChangelogPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = pickTab(TABS, (await searchParams).tab);
  const entries = LISTS[tab as keyof typeof LISTS];
  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="What's new" icon="sparkles" subtitle="Entries come from each merged PR's Changelog section. An edit shows after the next deploy." />
      <PageTabs tabs={TABS} active={tab} base="/admin/changelog" label="What's new audiences" />
      {entries.length === 0
        ? <EmptyState icon="sparkles" title="Nothing here yet">Entries appear once a merged PR marks its changelog for this audience.</EmptyState>
        : <ChangelogList entries={entries} showAudience={tab !== 'players'} editUrl={pr => `${REPO_URL}/pull/${pr}`} />}
    </div>
  );
}

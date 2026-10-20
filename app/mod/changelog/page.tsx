import { requireStaff } from '@/lib/staff-guard';
import { MOD_CHANGELOG } from '@/lib/changelog';
import { ChangelogList } from '@/app/components/ChangelogList';
import { EmptyState, PageHeader } from '../../admin/components/ui';

export const metadata = { title: "What's new · Mod", robots: { index: false } };
export const dynamic = 'force-dynamic';

/** What's new for the mod panel. */
export default async function ModChangelogPage() {
  await requireStaff('mod');
  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="What's new for mods" icon="sparkles" subtitle="Changes to the mod panel, newest first." />
      {MOD_CHANGELOG.length === 0
        ? <EmptyState icon="sparkles" title="Nothing here yet">Mod changes appear here once a merged PR marks its changelog for mods.</EmptyState>
        : <ChangelogList entries={MOD_CHANGELOG} showAudience />}
    </div>
  );
}

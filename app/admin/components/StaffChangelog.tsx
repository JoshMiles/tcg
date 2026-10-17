import { STAFF_CHANGELOG } from '@/lib/changelog';
import { ChangelogList } from '@/app/components/ChangelogList';
import { EmptyState, PageHeader } from './ui';

/**
 * What's new for staff (the admin and mod panels both show it): entries from the merged PRs whose changelog says "Audience: staff" or
 * "both". Players never see the staff-only ones.
 */
export function StaffChangelog() {
  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="What's new for staff" icon="sparkles" subtitle="Changes to the admin and mod panels, newest first. Player-facing changes are on the public What's new page." />
      {STAFF_CHANGELOG.length === 0
        ? <EmptyState icon="sparkles" title="Nothing here yet">Staff changes appear here once a merged PR marks its changelog for staff.</EmptyState>
        : <ChangelogList entries={STAFF_CHANGELOG} showAudience />}
    </div>
  );
}

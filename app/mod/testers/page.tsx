import { requireStaff } from '@/lib/staff-guard';
import { getAccessSettings, listTesters } from '@/lib/access';
import { MODE_LABELS } from '@/lib/access-core';
import { Chip, EmptyState, PageHeader, Panel } from '../../admin/components/ui';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Testers · Mod', robots: { index: false } };

/** The closed alpha / beta testers list, read only (admins change it in Settings → Access). */
export default async function ModTestersPage() {
  await requireStaff('mod');
  const [settings, testers] = await Promise.all([getAccessSettings(), listTesters()]);
  return (
    <div className="space-y-6">
      <PageHeader title="Testers" subtitle={`The site is ${settings.mode === 'open' ? 'open to everyone' : MODE_LABELS[settings.mode].toLowerCase()}. Only admins change this list.`} />
      <Panel title={`${testers.length} tester${testers.length === 1 ? '' : 's'}`}>
        {testers.length === 0 ? <EmptyState icon="flask" title="Nobody is on the list yet" /> : (
          <ul className="divide-y divide-gray-800/60">
            {testers.map(t => (
              <li key={t.login} className="py-2 flex flex-wrap items-center gap-x-4 text-sm">
                <span className="font-semibold text-white">{t.login}</span>
                <Chip tone={t.tier === 'alpha' ? 'purple' : 'amber'}>{t.tier === 'alpha' ? 'Alpha' : 'Beta'}</Chip>
                {t.note && <span className="text-xs text-gray-400">{t.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

import { Icon } from '@/app/components/Icon';
import { staffPage } from '@/lib/staff-guard';
import { getBigReversalCount, getStaffActionCounts } from '@/lib/audit';
import { getStaffLog, listStaff, listSuperAdmins } from '@/lib/staff';
import { ROLE_LABELS } from '@/lib/staff-core';
import { isPasswordLoginEnabled } from '@/lib/admin-token';
import { PageHeader, Panel } from '../components/ui';
import { StaffManager } from './StaffManager';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Staff · Admin', robots: { index: false } };

const ago = (t?: number) => {
  if (!t) return 'never';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

export default async function StaffPage() {
  const me = await staffPage('admin');
  const [staff, log, counts, bigReversals] = await Promise.all([listStaff(), getStaffLog(25), getStaffActionCounts(), getBigReversalCount()]);
  const supers = listSuperAdmins();
  const passwordOn = isPasswordLoginEnabled();

  return (
    <div className="space-y-6">
      <PageHeader title="Staff" subtitle="Who can sign in to the admin and mod panels. Everyone signs in with Twitch." icon="shield" />

      <div className="grid gap-4 md:grid-cols-3 text-sm">
        {([
          ['Super admin', 'The owner. Fixed in the code, can\'t be removed or changed, manages everyone.'],
          ['Admin', 'The full admin panel. Can add and remove mods. Only the super admin can add or remove admins.'],
          ['Mod', 'The mod panel only: live activity, moderating viewers, moderating trades.'],
        ] as const).map(([t, d]) => (
          <div key={t} className="rounded-xl border border-gray-800 bg-gray-900/60 p-3"><p className="font-bold text-white">{t}</p><p className="text-gray-400 mt-0.5">{d}</p></div>
        ))}
      </div>

      <Panel title="Super admin" icon="crown" hint="Matched by Twitch account ID, so renaming the account can't pass the role to someone else.">
        <ul className="space-y-1.5">
          {supers.map(s => (
            <li key={s.twitchId} className="flex items-center gap-2 text-sm text-gray-200">
              <Icon name="crown" className="text-yellow-400" /><strong className="text-white">{s.login}</strong>
              <span className="text-xs text-gray-500">Twitch ID {s.twitchId}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <StaffManager
        viewerRole={me.role}
        viewerLogin={me.login}
        staff={staff.map(s => ({ ...s, lastLoginText: ago(s.lastLogin), addedText: ago(s.addedAt) }))}
      />

      <Panel title="Actions in the last 7 days" icon="history" hint="Actions on viewers each person took (grants, removals, restrictions, tags, trade cancels), from the newest 500 audit entries.">
        {Object.keys(counts).length === 0 ? <p className="text-sm text-gray-600">Nothing yet.</p> : (
          <ul className="divide-y divide-gray-800/60 rounded-lg border border-gray-800 overflow-hidden text-sm">
            {Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([login, n]) => (
              <li key={login} className="px-4 py-2 flex items-center gap-3"><strong className="text-white">{login}</strong><span className="ml-auto tabular-nums text-gray-300">{n}</span></li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-sm text-gray-400">Big reversals (trial): <strong className="text-white tabular-nums">{bigReversals}</strong> in the last 14 days that would need a second approval. Nothing is blocked; each is in the audit trail.</p>

      <Panel title="Recent changes" icon="history" hint="Who was added, changed or removed, and by whom.">
        {log.length === 0 ? <p className="text-sm text-gray-600">Nothing yet.</p> : (
          <ul className="divide-y divide-gray-800/60 rounded-lg border border-gray-800 overflow-hidden text-sm">
            {log.map((l, i) => (
              <li key={i} className="px-4 py-2 flex flex-wrap items-center gap-x-3">
                <span className="text-gray-200"><strong className="text-white">{l.by}</strong> {l.action === 'added' ? 'added' : l.action === 'removed' ? 'removed' : 'changed'} <strong className="text-white">{l.login}</strong></span>
                <span className="text-xs text-gray-500">{l.detail}</span>
                <span className="ml-auto text-xs text-gray-600" title={`${new Date(l.at).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC`}>{ago(l.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-xs text-gray-500 leading-relaxed">
        Signed in as <strong className="text-gray-300">{me.displayName}</strong> ({ROLE_LABELS[me.role]}). A staff sign-in lasts an hour and then renews itself while the person is still on this list.
        Removing someone stops their changes at once and closes their panel within the hour.{' '}
        The emergency admin password is currently <strong className="text-gray-300">{passwordOn ? 'on' : 'off'}</strong>
        {passwordOn ? ' (set ADMIN_PASSWORD_LOGIN=off in Vercel to switch it off once you trust Twitch sign-in).' : '.'}
      </p>
    </div>
  );
}

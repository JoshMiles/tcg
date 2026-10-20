import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { ACHIEVEMENT_KINDS, getAchievementSettings, getCustomGoals, rowSetting } from '@/lib/achievement-settings';
import { PLACEHOLDERS } from '@/lib/achievements';
import { getAchievementStats } from '@/lib/achievements-store';
import { getBuffDefs } from '@/lib/buffs';
import { Panel, PageHeader } from '../components/ui';
import { saveAchievementSettingsAction, saveCustomGoalAction, deleteCustomGoalAction, recountAchievementsAction } from '../actions/achievements';
import { AchievementsForm, CustomGoalForm } from './AchievementsForm';

export const metadata = { title: 'Achievement Editor · Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

const SAVED: Record<string, string> = {
  settings: 'Built-in goals saved. Switched-off goals are no longer earned. Ones already earned stay.',
  goal: 'Custom goal saved.',
  deleted: 'Custom goal deleted. Players who earned it keep it.',
  recount: 'Counts rebuilt from every player\'s earned goals.',
};

export default async function AchievementsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const [settings, custom, buffDefs, stats] = await Promise.all([getAchievementSettings(), getCustomGoals(), getBuffDefs(), getAchievementStats()]);
  const items = ACHIEVEMENT_KINDS.map(k => ({ kind: k.kind, label: k.label, group: k.group, row: rowSetting(settings, k.kind) }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Achievement Editor"
        subtitle="Switch goals off, change their words, give a buff when earned, and make your own goals. A goal someone has already earned stays on their profile."
        icon="award"
      />
      {saved && SAVED[saved] && (
        <div role="status" className="rounded-lg border border-green-500/30 bg-green-950/30 px-4 py-2.5 text-sm text-green-300 flex items-center gap-2"><Icon name="check" /> {SAVED[saved]}</div>
      )}
      {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-2.5 text-sm text-red-300">That goal was not saved. Check the title, the rule and its rarity or version.</div>}

      <Panel title="Words you can use" icon="info" hint="Type these in a title or detail. They are filled in when the goal is shown.">
        <ul className="grid gap-1 sm:grid-cols-2 text-xs text-gray-400">
          {PLACEHOLDERS.map(p => <li key={p.word}><code className="text-gray-200">{`{${p.word}}`}</code> {p.means}</li>)}
          <li><code className="text-gray-200">{'{n}'}</code> the same as <code className="text-gray-200">{'{need}'}</code> (custom goals)</li>
        </ul>
        <p className="text-xs text-gray-500">Anything else in curly brackets is shown as typed. Words equal to the default are not stored, so the default can change later.</p>
      </Panel>

      <AchievementsForm items={items} buffDefs={buffDefs} counts={stats.counts} save={saveAchievementSettingsAction} />

      <Panel title="Custom goals" icon="star" hint="Worked out per season from each player's collection (trade goals count across all seasons). The target is capped at the cards that qualify, and a goal with no qualifying cards is left out.">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {custom.map(g => <CustomGoalForm key={g.id} goal={g} buffDefs={buffDefs} earned={stats.counts[`custom-${g.id}`] ?? 0} save={saveCustomGoalAction} remove={deleteCustomGoalAction} />)}
          <CustomGoalForm buffDefs={buffDefs} save={saveCustomGoalAction} />
        </div>
      </Panel>

      <Panel
        title="Recent earners"
        icon="users"
        hint="The last 25 goals earned. The counts above come from the same tally."
        actions={<form action={recountAchievementsAction}><button type="submit" className="btn btn-sm btn-ghost">Recount</button></form>}
      >
        {stats.recent.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing earned since counting started. Recount adds up goals earned before.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {stats.recent.map((r, i) => (
              <li key={`${r.username}${r.id}${i}`} className="flex flex-wrap items-center gap-x-2 text-gray-300">
                <Link href={`/u/${r.username}`} className="link">{r.username}</Link>
                <span>earned {r.title}</span>
                <span className="text-xs text-gray-500">{new Date(r.earnedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

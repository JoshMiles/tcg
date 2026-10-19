import { ACHIEVEMENT_KINDS, DETAIL_MAX, TITLE_MAX, rowSetting, type AchievementSettings } from '@/lib/achievement-settings';
import { Panel } from '../components/ui';

const GROUPS = ['Set', 'Rarity', 'Version', 'Edition number'] as const;

/** One row per built-in kind. A blank title or detail keeps the sentence the game already uses. */
export function AchievementsForm({ settings, save }: { settings: AchievementSettings; save: (formData: FormData) => Promise<void> }) {
  return (
    <form action={save} className="space-y-4">
      <p className="text-sm text-gray-400 leading-relaxed max-w-4xl">
        Switch a built-in goal off, or replace its title and detail. Leave a box empty to keep the built-in sentence. That sentence includes the season name, so a title you type replaces the whole line. A goal someone has already earned stays on their profile. This does not add new rules.
      </p>
      {GROUPS.map(group => (
        <Panel key={group} title={group} icon="award">
          <div className="space-y-3">
            {ACHIEVEMENT_KINDS.filter(k => k.group === group).map(kind => {
              const row = rowSetting(settings, kind.kind);
              return (
                <fieldset key={kind.kind} className="rounded-xl border border-gray-800 p-3 space-y-2">
                  <legend className="px-1 text-sm font-semibold text-white">{kind.label}</legend>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-200">
                    <input type="checkbox" role="switch" name={`on:${kind.kind}`} value="on" defaultChecked={row.on} className="toggle toggle-sm toggle-primary" />
                    On
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block text-xs text-gray-500">
                      Title
                      <input name={`title:${kind.kind}`} defaultValue={row.title} maxLength={TITLE_MAX} placeholder="Built-in title" className="input input-sm w-full mt-1" />
                    </label>
                    <label className="block text-xs text-gray-500">
                      Detail
                      <input name={`detail:${kind.kind}`} defaultValue={row.detail} maxLength={DETAIL_MAX} placeholder="Built-in detail" className="input input-sm w-full mt-1" />
                    </label>
                  </div>
                </fieldset>
              );
            })}
          </div>
        </Panel>
      ))}
      <button type="submit" className="px-4 py-2 btn btn-primary rounded-xl text-sm">Save achievements</button>
    </form>
  );
}

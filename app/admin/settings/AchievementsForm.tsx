import { ACHIEVEMENT_KINDS, DETAIL_MAX, TITLE_MAX, rowSetting, type AchievementSettings } from '@/lib/achievement-settings';
import { describeBuffDef, type BuffDef } from '@/lib/buffs-core';
import { Panel } from '../components/ui';

const GROUPS = ['Set', 'Rarity', 'Version', 'Edition number'] as const;

/** One row per built-in kind. A blank title or detail keeps the sentence the game already uses. */
export function AchievementsForm({
  settings,
  buffDefs = [],
  save,
}: {
  settings: AchievementSettings;
  buffDefs?: BuffDef[];
  save: (formData: FormData) => Promise<void>;
}) {
  const availableBuffs = buffDefs.filter(b => b.scope === 'self' && b.type !== 'grant-achievement');

  return (
    <form action={save} className="space-y-4">
      <p className="text-sm text-gray-400 leading-relaxed max-w-4xl">
        Switch a built-in goal off, replace its title and detail, or choose a bonus reward granted when first earned. Leave a box empty to keep the built-in sentence. That sentence includes the season name, so a title you type replaces the whole line. A goal someone has already earned stays on their profile. This does not add new rules.
      </p>
      {GROUPS.map(group => (
        <Panel key={group} title={group} icon="award">
          <div className="space-y-3">
            {ACHIEVEMENT_KINDS.filter(k => k.group === group).map(kind => {
              const row = rowSetting(settings, kind.kind);
              return (
                <fieldset key={kind.kind} className="rounded-xl border border-gray-800 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <legend className="px-1 text-sm font-semibold text-white">{kind.label}</legend>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-200">
                      <input type="checkbox" role="switch" name={`on:${kind.kind}`} value="on" defaultChecked={row.on} className="toggle toggle-sm toggle-primary" />
                      On
                    </label>
                  </div>
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
                  <label className="block text-xs text-gray-500">
                    Bonus reward
                    <select
                      name={`buff:${kind.kind}`}
                      defaultValue={row.buffId ?? ''}
                      className="select select-sm w-full mt-1 bg-gray-900 border-gray-700 text-gray-200"
                    >
                      <option value="">None (no bonus)</option>
                      {availableBuffs.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({describeBuffDef(b)})
                        </option>
                      ))}
                      {row.buffId && !availableBuffs.some(b => b.id === row.buffId) && (
                        <option value={row.buffId} disabled>
                          {row.buffId} (missing buff definition)
                        </option>
                      )}
                    </select>
                  </label>
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

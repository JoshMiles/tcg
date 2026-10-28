import { PendingButton } from '@/app/components/PendingButton';
import { RARITIES } from '@/lib/rarity';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import { RULES_MAX, SCENE_SECS_DEFAULT, SCENE_SECS_MAX, SHOUT_MAX, SHOUT_VARS, type PullRule } from '@/lib/pull-rules-core';
import type { BridgeCommand } from '@/lib/bridge-core';
import { deletePullRuleAction, savePullRulesAction, testPullRuleAction } from './mixitup-actions';
import { CardFrame } from './CardFrame';
import { CardForm } from './CardForm';

const label = 'block text-xs font-semibold text-gray-300 mb-1';
const secondary = 'rounded-lg border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-200 hover:border-gray-500 disabled:opacity-60';

const NEW_RULE: PullRule = { id: '', on: true, when: {}, commandId: '' };

/** A pick from the names TCG Bridge reported (a saved name that is no longer in the list stays choosable). */
function ObsSelect({ id, name, none, current, names }: { id: string; name: string; none: string; current?: string; names: string[] }) {
  if (!names.length && !current) return <><input type="hidden" name={name} value="" /><p className="text-sm text-gray-500 py-2">Switch on &ldquo;Talk to OBS&rdquo; in TCG Bridge to choose from your OBS list</p></>;
  return (
    <select id={id} name={name} defaultValue={current ?? ''} className="select w-full">
      <option value="">{none}</option>
      {current && !names.includes(current) && <option value={current}>{current} (not in the last list)</option>}
      {names.map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

/** What viewers get → Big pull rules: run a Mix It Up command (a sound, lights, a chat line) and OBS actions (a clip, a scene, a source) when a pull on stream matches a rule. ROADMAP 55.6d, 55.8, 63.3. */
export function PullRules({ rules, commands, obs }: { rules: PullRule[]; commands: BridgeCommand[]; obs: { scenes: string[]; sources: string[] } }) {
  const rows = rules.length < RULES_MAX ? [...rules, NEW_RULE] : rules;
  return (
    <CardFrame id="bigpulls" how={<>
      <p>When a pull is shown on stream and matches a rule, TCG Bridge runs a Mix It Up command of yours (a sound, lights, a message of its own). The first rule that matches runs and the rest are skipped.</p>
      <p>The command gets the viewer, the card, its rarity and its version as <code>$arg1text</code> to <code>$arg4text</code>. Needs TCG Bridge 0.4.0 or newer; pulls from a gift never run a rule. Up to {RULES_MAX} rules.</p>
      <p>Test sends the saved rule&rsquo;s command once with a made-up pull (cheesyviewer, Gouda Goat, Epic, Full Art Holo), and does its OBS actions at once (the source for 3 seconds). Delete removes the saved rule at once and keeps no other edits.</p>
    </>}>
      <CardForm action={savePullRulesAction} saveLabel="Save rules">
        {commands.length === 0 && <p className="text-sm text-amber-300">Pair TCG Bridge to choose a command. The app lists the commands it finds in Mix It Up.</p>}
        <ul className="space-y-4">
          {rows.map((r, i) => {
            const isNew = !r.id;
            const fixed = r.commandId && !commands.some(c => c.id === r.commandId);
            return (
              <li key={r.id || 'new'} className="rounded-xl border border-gray-800 p-4 space-y-3">
                <input type="hidden" name={`rule_${i}_id`} value={r.id} />
                <p className="text-xs font-semibold text-gray-400">{isNew ? 'Add a rule (choose what it does, then Save rules)' : `Rule ${i + 1}`}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={label} htmlFor={`rule-${i}-min`}>Rarity at least</label>
                    <select id={`rule-${i}-min`} name={`rule_${i}_min`} defaultValue={String(r.when.minRarity ?? '')} className="select w-full">
                      <option value="">Any rarity</option>
                      {[...RARITIES].filter(x => x.stars > 1).sort((a, b) => a.stars - b.stars).map(x => <option key={x.stars} value={x.stars}>{x.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label} htmlFor={`rule-${i}-command`}>Run</label>
                    {commands.length > 0 || fixed ? (
                      <select id={`rule-${i}-command`} name={`rule_${i}_command`} defaultValue={r.commandId} className="select w-full">
                        <option value="">No command</option>
                        {fixed && <option value={r.commandId}>Saved command (not in the last list)</option>}
                        {commands.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : (
                      <>
                        <input type="hidden" name={`rule_${i}_command`} value="" />
                        <p className="text-sm text-gray-500 py-2">Pair TCG Bridge to choose a command</p>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <label className={label} htmlFor={`rule-${i}-say`}>Say in chat <span className="font-normal text-gray-500">(when the card is shown; variables {SHOUT_VARS.map(v => `{${v}}`).join(' ')}; needs TCG Bridge 0.8.0 or newer)</span></label>
                  <input id={`rule-${i}-say`} name={`rule_${i}_say`} defaultValue={r.say ?? ''} maxLength={SHOUT_MAX} placeholder="Nothing" className="input w-full" />
                </div>
                <fieldset className="rounded-lg border border-gray-800 p-3 space-y-3">
                  <legend className={`${label} px-1`}>In OBS <span className="font-normal text-gray-500">(needs TCG Bridge 0.6.0 or newer talking to OBS)</span></legend>
                  <label className="flex items-center gap-1.5 text-sm text-gray-300">
                    <input type="checkbox" name={`rule_${i}_clip`} defaultChecked={!!r.obs?.clip} className="checkbox checkbox-sm" />
                    Save a clip a few seconds after the card is shown (needs the replay buffer on in OBS)
                  </label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className={label} htmlFor={`rule-${i}-scene`}>Switch to scene</label>
                      <ObsSelect id={`rule-${i}-scene`} name={`rule_${i}_scene`} none="Stay on the current scene" current={r.obs?.scene} names={obs.scenes} />
                    </div>
                    <div>
                      <label className={label} htmlFor={`rule-${i}-secs`}>For (seconds)</label>
                      <input id={`rule-${i}-secs`} name={`rule_${i}_secs`} type="number" min={1} max={SCENE_SECS_MAX} defaultValue={r.obs?.sceneSecs ?? SCENE_SECS_DEFAULT} className="input w-full" />
                    </div>
                  </div>
                  <div>
                    <label className={label} htmlFor={`rule-${i}-source`}>Show a source while the pack opens</label>
                    <ObsSelect id={`rule-${i}-source`} name={`rule_${i}_source`} none="No source" current={r.obs?.source} names={obs.sources} />
                  </div>
                </fieldset>
                <fieldset>
                  <legend className={label}>Card versions <span className="font-normal text-gray-500">(none ticked = any)</span></legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {VARIANTS.map(v => (
                      <label key={v} className="flex items-center gap-1.5 text-sm text-gray-300">
                        <input type="checkbox" name={`rule_${i}_variants`} value={v} defaultChecked={!!r.when.variants?.includes(v)} className="checkbox checkbox-sm" />
                        {VARIANT_LABELS[v]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <label className="flex items-center gap-1.5 text-sm text-gray-300">
                      <input type="checkbox" name={`rule_${i}_new`} defaultChecked={!!r.when.newToDex} className="checkbox checkbox-sm" />
                      Only a card new to the viewer&rsquo;s dex
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold text-white">
                      <input type="checkbox" name={`rule_${i}_on`} defaultChecked={r.on} className="toggle toggle-sm toggle-primary" />
                      On
                    </label>
                  </div>
                  {!isNew && (
                    <div className="flex gap-2">
                      <PendingButton formAction={testPullRuleAction.bind(null, r.id)} className={secondary}>Test</PendingButton>
                      <PendingButton formAction={deletePullRuleAction.bind(null, r.id)} className={secondary}>Delete</PendingButton>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CardForm>
    </CardFrame>
  );
}

import { PendingButton } from '@/app/components/PendingButton';
import { Icon } from '@/app/components/Icon';
import { RARITIES } from '@/lib/rarity';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import { RULES_MAX, type PullRule } from '@/lib/pull-rules-core';
import type { BridgeCommand } from '@/lib/bridge-core';
import { deletePullRuleAction, savePullRulesAction, testPullRuleAction } from './mixitup-actions';

const label = 'block text-xs font-semibold text-gray-300 mb-1';
const primary = 'rounded-lg bg-yellow-500 px-4 py-2 text-sm font-bold text-black hover:bg-yellow-400 disabled:opacity-60';
const secondary = 'rounded-lg border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-200 hover:border-gray-500 disabled:opacity-60';

const NEW_RULE: PullRule = { id: '', on: true, when: {}, commandId: '' };

/** Mix It Up → Paid pulls → Big pulls: run a Mix It Up command (a sound, lights, a chat line) when a pull on stream matches a rule. ROADMAP 55.6d. */
export function PullRules({ rules, commands }: { rules: PullRule[]; commands: BridgeCommand[] }) {
  const rows = rules.length < RULES_MAX ? [...rules, NEW_RULE] : rules;
  return (
    <form action={savePullRulesAction} className="card rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-800">
        <h2 className="font-semibold text-white flex items-center gap-2"><Icon name="sparkles" className="text-yellow-400" />Big pulls</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          When a pull is shown on stream and matches a rule, TCG Bridge runs a Mix It Up command of yours (a sound, lights, a message of its own). The first rule that matches runs and the rest are skipped.
          The command gets the viewer, the card, its rarity and its version as <code>$arg1text</code> to <code>$arg4text</code>. Needs TCG Bridge 0.4.0 or newer; pulls from a gift never run a rule. Up to {RULES_MAX} rules.
        </p>
      </div>
      <div className="px-6 py-5 space-y-4">
        {commands.length === 0 && <p className="text-sm text-amber-300">Pair TCG Bridge to choose a command. The app lists the commands it finds in Mix It Up.</p>}
        <ul className="space-y-4">
          {rows.map((r, i) => {
            const isNew = !r.id;
            const fixed = r.commandId && !commands.some(c => c.id === r.commandId);
            return (
              <li key={r.id || 'new'} className="rounded-xl border border-gray-800 p-4 space-y-3">
                <input type="hidden" name={`rule_${i}_id`} value={r.id} />
                <p className="text-xs font-semibold text-gray-400">{isNew ? 'Add a rule (choose a command, then Save rules)' : `Rule ${i + 1}`}</p>
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
                        <option value="">Choose a command</option>
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
        <div className="flex flex-wrap items-center gap-3">
          <PendingButton type="submit" className={primary}>Save rules</PendingButton>
          <p className="text-[11px] text-gray-500">Test sends the saved rule&rsquo;s command once with a made-up pull (cheesyviewer, Gouda Goat, Epic, Full Art Holo). Delete removes the saved rule at once and keeps no other edits.</p>
        </div>
      </div>
    </form>
  );
}

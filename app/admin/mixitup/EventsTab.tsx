import Link from 'next/link';
import { PendingButton } from '@/app/components/PendingButton';
import { describeBuffDef, type BuffDef } from '@/lib/buffs-core';
import { EVENT_INFO, EVENT_NAMES, EVENT_PACK_CAP, EVENT_SETUP, type EventRewards } from '@/lib/event-rewards-core';
import { incomingSetup } from '@/lib/mixitup-setup';
import { Panel, fieldClass, selectClass } from '../components/ui';
import { saveEventRewardsAction } from './mixitup-actions';
import { CopyCard } from './setup/SetupClient';

const help = 'text-[11px] text-gray-500 leading-relaxed';
const WHAT: Record<string, string> = {
  'gifted-subs': 'One pack for each sub given.',
  bits: 'One pack for every set number of bits in a cheer, rounded down.',
  raid: 'One pack when the raid is big enough.',
  redeem: 'One pack for each redeem.',
};

/** Mix It Up → Events (ROADMAP 55.4g): what gifted subs, bits, raids and channel point redeems earn, and the Copy setup cards for the event commands. */
export function EventsTab({ rewards, buffs, url, secret }: { rewards: EventRewards; buffs: BuffDef[]; url: string; secret: string }) {
  const usable = buffs.filter(b => b.streamDeck && b.scope !== 'community' && b.type !== 'grant-achievement');
  return (
    <div className="space-y-6">
      <form action={saveEventRewardsAction} className="space-y-6">
        <Panel title="Event rewards" icon="gift" hint={<>A Mix It Up event command calls the pull address with the viewer who caused it. Packs are free pulls: never charged, no limit, cooldown or queue cap. At most {EVENT_PACK_CAP} packs per event. All off until you switch them on.</>}>
          {EVENT_NAMES.map(name => {
            const e = rewards[name];
            const info = EVENT_INFO[name];
            return (
              <div key={name} className="rounded-xl border border-gray-800 bg-gray-950/50 p-4 space-y-3">
                <label className="flex items-center gap-2 text-sm text-white font-semibold">
                  <input type="checkbox" name={`ev_${name}_on`} defaultChecked={e.on} className="toggle toggle-sm toggle-primary" />
                  {info.label}
                </label>
                <p className={help}>{WHAT[name]}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <fieldset className="fieldset">
                    <legend className="fieldset-legend"><label htmlFor={`ev-${name}-reward`}>Reward</label></legend>
                    <select id={`ev-${name}-reward`} name={`ev_${name}_reward`} defaultValue={e.reward} className={selectClass}>
                      <option value="packs">Free packs</option>
                      <option value="buff">A buff</option>
                    </select>
                  </fieldset>
                  <fieldset className="fieldset">
                    <legend className="fieldset-legend"><label htmlFor={`ev-${name}-buff`}>Buff (when the reward is a buff)</label></legend>
                    <select id={`ev-${name}-buff`} name={`ev_${name}_buff`} defaultValue={e.buffId ?? ''} className={selectClass}>
                      <option value="">None</option>
                      {usable.map(b => <option key={b.id} value={b.id}>{b.name} ({describeBuffDef(b)})</option>)}
                    </select>
                  </fieldset>
                  {info.every && (
                    <fieldset className="fieldset">
                      <legend className="fieldset-legend"><label htmlFor={`ev-${name}-every`}>{info.every.label}</label></legend>
                      <input id={`ev-${name}-every`} name={`ev_${name}_every`} type="number" min={1} step={1} defaultValue={e.every ?? info.every.default} className={fieldClass} />
                    </fieldset>
                  )}
                </div>
              </div>
            );
          })}
          <p className={help}>A buff reward applies once per event, to the viewer, with the same rules as a Stream Deck button (a buff already active or too many buffs is refused). Only buffs with the Stream Deck switch on that go to one viewer are listed; switch it on in the <Link href="/admin/buffs" className="link">Buff Editor</Link>.</p>
        </Panel>
        <Panel title="Raid shout-out" icon="gift" hint="When a big enough raid arrives, the raider's best card shows on the overlay as &quot;Raid from (name)&quot; and chat gets one line. It runs from the Raid event command below. Nothing shows for a private profile or a raider with no cards, and each raider gets one shout-out per stream. Off until you switch it on.">
          <label className="flex items-center gap-2 text-sm text-white font-semibold">
            <input type="checkbox" name="ev_shout_on" defaultChecked={rewards.raidShoutout.on} className="toggle toggle-sm toggle-primary" />
            Raid shout-out
          </label>
          <fieldset className="fieldset">
            <legend className="fieldset-legend"><label htmlFor="ev-shout-min">Smallest raid that gets one (viewers)</label></legend>
            <input id="ev-shout-min" name="ev_shout_min" type="number" min={1} step={1} defaultValue={rewards.raidShoutout.minViewers} className={fieldClass} />
          </fieldset>
        </Panel>
        <PendingButton type="submit" className="btn btn-primary btn-sm self-start">Save event rewards</PendingButton>
      </form>
      <section className="space-y-3">
        <h2 className="font-semibold text-white">Copy setup</h2>
        <p className="text-sm text-gray-300">
          Make a Mix It Up event command for each event you switch on (Web Request action: POST, JSON, then a Chat Message that says the <code>message</code> field; an empty message means nothing to say). Name each command exactly like its card, so the check on the Connection tab can find it.
          The special identifiers come from Mix It Up&rsquo;s source code and have not been tried against a live Mix It Up, so test each command once. Add <code>&quot;requestId&quot;</code> with a value that differs on every run to make a retry safe.
        </p>
        {EVENT_SETUP.map(s => <CopyCard key={s.title} title={s.title} note={s.note} {...incomingSetup(url, secret, s.fields)} />)}
      </section>
    </div>
  );
}

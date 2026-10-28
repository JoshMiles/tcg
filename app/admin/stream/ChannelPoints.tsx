import Link from 'next/link';
import { describeBuffDef, type BuffDef } from '@/lib/buffs-core';
import type { RewardList } from '@/lib/twitch-awards';
import { AWARD_NAMES, type Awards } from '@/lib/twitch-awards-core';
import { fieldClass, selectClass } from '../components/ui';
import { CardFrame } from './CardFrame';
import { CardForm } from './CardForm';
import { saveRewardAwardsAction } from './mixitup-actions';

const help = 'text-[11px] text-gray-500 leading-relaxed';

/** What viewers get → Channel points (ROADMAP 58.3, 63.3): the channel's own rewards, listed read-only from Twitch, each with an award. Nothing is fulfilled or refunded on Twitch. */
export function ChannelPoints({ list, awards, buffs, paused }: { list: RewardList; awards: Awards; buffs: BuffDef[]; paused: boolean }) {
  const usable = buffs.filter(b => b.streamDeck && b.scope !== 'community' && b.type !== 'grant-achievement');
  return (
    <CardFrame id="points" how={<>
      <p>The list is read from Twitch each time this card opens; nothing is created, fulfilled or refunded there, so a failed award shows in the Mix It Up log and a staff notice asks a mod to refund it by hand in Twitch&rsquo;s reward queue.</p>
      <p>While the live channel is connected and any reward has an award, the Redeem event in Event rewards is ignored.</p>
    </>}>
      {paused && <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-300">Awards are paused, so redeems give nothing right now. Turn them back on in <Link href="/admin/stream?section=live" className="link">Live</Link>.</p>}
      {!list.ok ? <p role="alert" className="text-sm text-amber-300">{list.message}</p> : list.rewards.length === 0 ? <p className="text-sm text-gray-400">This channel has no channel points rewards yet.</p> : (
        <CardForm action={saveRewardAwardsAction}>
          {list.rewards.map(r => {
            const a = awards[r.id];
            return (
              <div key={r.id} className="rounded-xl border border-gray-800 bg-gray-950/50 p-4 space-y-3">
                <input type="hidden" name="reward" value={r.id} />
                <p className="text-sm text-white font-semibold">{r.title || 'Untitled reward'}{!r.enabled && <span className="ml-2 text-[11px] font-normal text-gray-500">(switched off on Twitch)</span>}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <fieldset className="fieldset">
                    <legend className="fieldset-legend"><label htmlFor={`aw-${r.id}-kind`}>Award</label></legend>
                    <select id={`aw-${r.id}-kind`} name={`aw_${r.id}_kind`} defaultValue={a?.kind ?? 'none'} className={selectClass}>
                      {(['none', 'pack', 'showoff', 'buff', 'happyhour'] as const).map(k => <option key={k} value={k}>{AWARD_NAMES[k]}</option>)}
                    </select>
                  </fieldset>
                  <fieldset className="fieldset">
                    <legend className="fieldset-legend"><label htmlFor={`aw-${r.id}-buff`}>Buff (for a buff)</label></legend>
                    <select id={`aw-${r.id}-buff`} name={`aw_${r.id}_buff`} defaultValue={a?.kind === 'buff' ? a.buffId : ''} className={selectClass}>
                      <option value="">None</option>
                      {usable.map(b => <option key={b.id} value={b.id}>{b.name} ({describeBuffDef(b)})</option>)}
                    </select>
                  </fieldset>
                  <fieldset className="fieldset">
                    <legend className="fieldset-legend"><label htmlFor={`aw-${r.id}-minutes`}>Happy hour minutes</label></legend>
                    <input id={`aw-${r.id}-minutes`} name={`aw_${r.id}_minutes`} type="number" min={1} max={240} step={1} defaultValue={a?.kind === 'happyhour' ? a.minutes : 30} className={fieldClass} />
                  </fieldset>
                  <fieldset className="fieldset">
                    <legend className="fieldset-legend"><label htmlFor={`aw-${r.id}-hh`}>Happy hour kind</label></legend>
                    <div className="flex gap-2">
                      <select id={`aw-${r.id}-hh`} name={`aw_${r.id}_hh`} defaultValue={a?.kind === 'happyhour' ? a.hh : 'free'} className={selectClass}>
                        <option value="free">Free packs</option>
                        <option value="discount">Percent off</option>
                      </select>
                      <input aria-label="Percent off" name={`aw_${r.id}_percent`} type="number" min={1} max={99} step={1} defaultValue={a?.kind === 'happyhour' && a.hh === 'discount' ? a.percent : 25} className={fieldClass} />
                    </div>
                  </fieldset>
                </div>
              </div>
            );
          })}
          <p className={help}>The buff, minutes and percent only count for the award they belong to. A buff award uses the same rules as a Stream Deck button; pick buffs in the <Link href="/admin/buffs" className="link">Buff Editor</Link>. An award for a reward not listed here is kept.</p>
        </CardForm>
      )}
    </CardFrame>
  );
}

import Link from 'next/link';
import { describeBuffDef, type BuffDef } from '@/lib/buffs-core';
import { CHAT_LINE_MAX, END_VARS, START_VARS, type ChatSettings } from '@/lib/bridge-chat-core';
import { EVENT_INFO, EVENT_NAMES, EVENT_PACK_CAP, type EventRewards } from '@/lib/event-rewards-core';
import type { MixItUpSettings } from '@/lib/mixitup-core';
import { fieldClass, selectClass } from '../components/ui';
import { CardForm } from './CardForm';
import { CardFrame } from './CardFrame';
import { PaidPullFields } from './PaidPullFields';
import { saveChatAction, saveEventRewardsAction, saveMixItUpAction, saveRaidShoutoutAction } from './mixitup-actions';

const help = 'text-[11px] text-gray-500 leading-relaxed';
const label = 'block text-xs font-semibold text-gray-300 mb-1';
const vars = (v: readonly string[]) => v.map(x => `{${x}}`).join(' ');

/** Card 1, Paid pulls: the switch, the price and limits, the messages. Happy hour and the pack goal are on Live; how the site reaches Mix It Up is in Connections. */
export function PaidCard({ settings: s }: { settings: MixItUpSettings }) {
  return (
    <CardFrame id="paid" how={<>
      <p>When this is on, a pull from the bot checks the viewer&rsquo;s balance first and takes {s.currency} when the card is revealed. When it is off, pulls work exactly as before. Gifting packs from the dashboard never charges.</p>
      <p className="font-semibold text-gray-300">How a pull goes</p>
      <ol className="list-decimal pl-5 space-y-1">
        <li>The bot asks for a pack for a viewer. We check their pulls this stream and ask Mix It Up for their balance.</li>
        <li>Not enough, or over the limit: no pack, and the answer carries a <code>message</code> the command can post to chat.</li>
        <li>Enough: the pack opens. When the card is revealed we tell Mix It Up to take {s.cost.toLocaleString()} {s.currency} and send your message.</li>
        <li>If Mix It Up does not confirm the payment, the edition is taken back and the System Discord channel is told.</li>
      </ol>
      {s.connection === 'addresses' && <p>Whatever sits at each address must answer in the reply to each request (Mix It Up has no action that answers a request, so use TCG Bridge or a small service of your own). A reply counts as paid when it is a 2xx and does not say <code>ok</code>, <code>success</code> or <code>applied</code> is <code>false</code>.</p>}
    </>}>
      <CardForm action={saveMixItUpAction}>
        <label className="flex items-center gap-2 text-sm text-white font-semibold">
          <input type="checkbox" name="enabled" defaultChecked={s.enabled} className="toggle toggle-sm toggle-primary" />
          Charge for pulls
        </label>
        <PaidPullFields settings={s} />
      </CardForm>
    </CardFrame>
  );
}

/** Card 2, !pack packs: the packs a viewer can ask for by name. Read-only; a price is set on the pack's own editor. */
export function PacksCard({ settings: s, packs }: { settings: MixItUpSettings; packs: { id: string; name: string; price?: number }[] }) {
  return (
    <CardFrame id="packs" how={<p>A viewer types <code>!pack &lt;name&gt;</code> (the whole name, or the start of it if only one pack starts that way). Prices are set on each pack&rsquo;s editor; the base price is {s.cost.toLocaleString()} {s.currency}. Every paid pull is charged the price of the pack it opens (pack price, else role price, else base), including a plain <code>!pack</code>, which opens a random pack.</p>}>
      {packs.length === 0 ? <p className="text-sm text-gray-500">The active season has no pack with cards to open.</p> : (
        <table className="table table-sm">
          <thead><tr><th>Pack</th><th className="text-right">Price</th><th><span className="sr-only">Edit</span></th></tr></thead>
          <tbody>
            {packs.map(p => (
              <tr key={p.id}>
                <td className="font-semibold text-white">{p.name}</td>
                <td className="text-right">{p.price ? <>{p.price.toLocaleString()} {s.currency}</> : <span className="text-gray-500">{s.cost.toLocaleString()} {s.currency} (base)</span>}</td>
                <td className="text-right"><Link href={`/admin/packs/${p.id}?view=settings`} className="link">Edit pack<span className="sr-only"> {p.name}</span></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </CardFrame>
  );
}

const WHAT: Record<string, string> = {
  'gifted-subs': 'One pack for each sub given.',
  bits: 'One pack for every set number of bits in a cheer, rounded down.',
  raid: 'One pack when the raid is big enough.',
  redeem: 'One pack for each redeem. Ignored while Twitch handles redemptions (the live channel is connected and a channel points reward has an award on the Channel points card).',
};

/** Card 3, Event rewards: what gifted subs, bits, raids and channel point redeems earn (ROADMAP 55.4g). */
export function EventsCard({ rewards, buffs }: { rewards: EventRewards; buffs: BuffDef[] }) {
  const usable = buffs.filter(b => b.streamDeck && b.scope !== 'community' && b.type !== 'grant-achievement');
  return (
    <CardFrame id="events" how={<>
      <p>A Mix It Up event command calls the pull address with the viewer who caused it; the Mix It Up commands box above has a download for each. Packs are free pulls: never charged, no limit, cooldown or queue cap. At most {EVENT_PACK_CAP} packs per event. All off until you switch them on.</p>
      <p>A buff reward applies once per event, to the viewer, with the same rules as a Stream Deck button (a buff already active or too many buffs is refused). Only buffs with the Stream Deck switch on that go to one viewer are listed; switch it on in the <Link href="/admin/buffs" className="link">Buff Editor</Link>.</p>
    </>}>
      <CardForm action={saveEventRewardsAction}>
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
      </CardForm>
    </CardFrame>
  );
}

/** Card 4, Raid shout-out (ROADMAP 57.6): its own card and its own Save, so it never switches the event rewards off. */
export function ShoutoutCard({ rewards }: { rewards: EventRewards }) {
  return (
    <CardFrame id="shoutout" how={<p>When a big enough raid arrives, the raider&rsquo;s best card shows on the overlay as &ldquo;Raid from (name)&rdquo; and chat gets one line. It runs from the Raid event command in the Mix It Up commands box above. Nothing shows for a private profile or a raider with no cards, and each raider gets one shout-out per stream. Off until you switch it on.</p>}>
      <CardForm action={saveRaidShoutoutAction}>
        <label className="flex items-center gap-2 text-sm text-white font-semibold">
          <input type="checkbox" name="ev_shout_on" defaultChecked={rewards.raidShoutout.on} className="toggle toggle-sm toggle-primary" />
          Raid shout-out
        </label>
        <fieldset className="fieldset sm:max-w-md">
          <legend className="fieldset-legend"><label htmlFor="ev-shout-min">Smallest raid that gets one (viewers)</label></legend>
          <input id="ev-shout-min" name="ev_shout_min" type="number" min={1} step={1} defaultValue={rewards.raidShoutout.minViewers} className={fieldClass} />
        </fieldset>
      </CardForm>
    </CardFrame>
  );
}

/** Card 6, Stream start and end (ROADMAP 55.10): the two chat posts. The Brie Bucks backup and check are in Connections. */
export function StartEndCard({ chat }: { chat: ChatSettings }) {
  return (
    <CardFrame id="startend" how={<>
      <p>Both go through TCG Bridge 0.8.0 or newer and are off until you switch them on. A stream starts when the site first sees it live and ends when it sees it offline.</p>
      <p>To shout a big pull in chat, add a line to a rule on the Big pull rules card.</p>
    </>}>
      <CardForm action={saveChatAction}>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-white"><input type="checkbox" name="startOn" defaultChecked={chat.startOn} className="toggle toggle-sm toggle-primary" />Say it when the stream starts</label>
          <label className={label} htmlFor="chat-start">Message <span className="font-normal text-gray-500">(variables {vars(START_VARS)})</span></label>
          <input id="chat-start" name="startText" defaultValue={chat.startText} maxLength={CHAT_LINE_MAX} className="input w-full" />
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-white"><input type="checkbox" name="endOn" defaultChecked={chat.endOn} className="toggle toggle-sm toggle-primary" />Post the top pull and top three pullers when it ends</label>
          <label className={label} htmlFor="chat-end">Message <span className="font-normal text-gray-500">(variables {vars(END_VARS)}; nothing is posted when nobody pulled)</span></label>
          <input id="chat-end" name="endText" defaultValue={chat.endText} maxLength={CHAT_LINE_MAX} className="input w-full" />
        </div>
      </CardForm>
    </CardFrame>
  );
}

/** Card 9, Stream Deck buffs: the buffs that answer the Stream Deck. Read-only; a buff is switched on in the Buff Editor, and the downloads are in the helper. */
export function StreamDeckCard({ buffs }: { buffs: BuffDef[] }) {
  const on = buffs.filter(b => b.streamDeck);
  return (
    <CardFrame id="streamdeck" how={<>
      <p>Each button is one Mix It Up command. Download them from the Mix It Up commands box above (Stream Deck buffs and Quick actions), import them in Mix It Up, and run them from the Stream Deck with Mix It Up&rsquo;s plugin. Mix It Up&rsquo;s Developer API service must be switched on.</p>
      <p>To reward one named viewer, set <code>target</code> to <code>viewer</code> and add <code>username</code>; <code>last-pull</code> is whoever pulled last this stream. A button pressed twice within 10 seconds counts once.</p>
    </>}>
      {on.length === 0 ? <p className="text-sm text-gray-500">No buff answers the Stream Deck yet.</p> : (
        <ul className="divide-y divide-gray-800/70 rounded-xl border border-gray-800">
          {on.map(b => (
            <li key={b.id} className="px-4 py-2.5">
              <p className="text-sm font-semibold text-white">{b.name}</p>
              <p className="text-[11px] text-gray-500">{describeBuffDef(b)}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-gray-300">Switch a buff on or off for the Stream Deck in the <Link href="/admin/buffs" className="link">Buff Editor</Link>.</p>
    </CardFrame>
  );
}

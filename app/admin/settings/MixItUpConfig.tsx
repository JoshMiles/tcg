import { PendingButton } from '../components/PendingButton';
import { Icon } from '@/app/components/Icon';
import type { MixItUpSettings } from '@/lib/mixitup-core';
import type { MixItUpLogEntry } from '@/lib/mixitup';
import { MESSAGE_MAX, MESSAGE_VARS } from '@/lib/mixitup-core';
import { saveMixItUpAction, checkBalanceAction, sendTestAction } from './mixitup-actions';
import { MessageField } from './MessageField';

const input = 'w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-yellow-500 focus:outline-none';
const label = 'block text-xs font-semibold text-gray-300 mb-1';
const help = 'text-[11px] text-gray-500 mt-1';
const primary = 'rounded-lg bg-yellow-500 px-4 py-2 text-sm font-bold text-black hover:bg-yellow-400 disabled:opacity-60';
const secondary = 'rounded-lg border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-200 hover:border-gray-500 disabled:opacity-60';

/** Settings → Mix It Up: viewers pay a currency for a pack (ROADMAP Track 12). */
export function MixItUpConfig({ settings: s, log }: { settings: MixItUpSettings; log: MixItUpLogEntry[] }) {
  return (
    <div className="space-y-6">
      <form action={saveMixItUpAction} className="tcg-panel rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-800">
          <h2 className="font-semibold text-white flex items-center gap-2"><Icon name="coins" className="text-yellow-400" />Pay to pull with Mix It Up</h2>
          <p className="text-xs text-gray-500 mt-0.5">When this is on, a pull from the bot checks the viewer&rsquo;s balance first and takes {s.currency} when the card is revealed. When it is off, pulls work exactly as before. Gifting packs from the dashboard never charges.</p>
        </div>
        <div className="px-6 py-5 space-y-5">
          <label className="flex items-center gap-2 text-sm text-white font-semibold">
            <input type="checkbox" name="enabled" defaultChecked={s.enabled} className="h-4 w-4 accent-yellow-500" />
            Charge for pulls
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="mx-balance">Balance address</label>
              <input id="mx-balance" name="balanceUrl" defaultValue={s.balanceUrl} placeholder="https://webhook.mixitupapp.com/..." className={input} />
              <p className={help}>A Mix It Up webhook command that answers with the viewer&rsquo;s balance. We send <code>{'{ action: "balance", username, currency, secret }'}</code>.</p>
            </div>
            <div>
              <label className={label} htmlFor="mx-deduct">Deduct address (optional)</label>
              <input id="mx-deduct" name="deductUrl" defaultValue={s.deductUrl} placeholder="Leave empty to use the balance address" className={input} />
              <p className={help}>The command that takes the currency. We send <code>{'{ action: "deduct", username, amount, currency, message, pullId, secret }'}</code>. With one address, the command tells them apart by <code>action</code>.</p>
            </div>
            <div>
              <label className={label} htmlFor="mx-secret">Shared secret (optional)</label>
              <input id="mx-secret" name="secret" defaultValue={s.secret} autoComplete="off" className={input} />
              <p className={help}>Sent as <code>secret</code> in every request, so the command can check it came from here.</p>
            </div>
            <div>
              <label className={label} htmlFor="mx-field">Balance field</label>
              <input id="mx-field" name="balanceField" defaultValue={s.balanceField} className={input} />
              <p className={help}>The key in the reply that holds the number, for example <code>{'{ "balance": 250 }'}</code>.</p>
            </div>
            <div>
              <label className={label} htmlFor="mx-currency">Currency name</label>
              <input id="mx-currency" name="currency" defaultValue={s.currency} className={input} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label} htmlFor="mx-cost">Price per pack</label>
                <input id="mx-cost" name="cost" type="number" min={1} step={1} defaultValue={s.cost} className={input} />
              </div>
              <div>
                <label className={label} htmlFor="mx-limit">Default pulls per viewer per stream</label>
                <input id="mx-limit" name="limit" type="number" min={0} step={1} defaultValue={s.limit} className={input} />
              </div>
              <p className={`${help} col-span-2 -mt-2`}>0 = no limit. Each viewer can have their own limit and temporary bonuses on their user page (Admin tab). &ldquo;Per stream&rdquo; follows the live Twitch stream; when the channel is offline it is per day (UTC).</p>
            </div>
          </div>

          <div>
            <label className={label} htmlFor="mx-message">Message sent to Mix It Up with the payment</label>
            <MessageField id="mx-message" name="message" defaultValue={s.message} max={MESSAGE_MAX} />
            <p className={help}>Placeholders: {MESSAGE_VARS.map(v => <code key={v} className="mr-1.5">{`{${v}}`}</code>)}</p>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-4 text-xs text-gray-400 space-y-1.5">
            <p className="font-semibold text-gray-300">How a pull goes</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>The bot asks for a pack for a viewer. We check their pulls this stream and ask Mix It Up for their balance.</li>
              <li>Not enough, or over the limit: no pack, and the answer carries a <code>message</code> the command can post to chat.</li>
              <li>Enough: the pack opens. When the card is revealed we tell Mix It Up to take {s.cost.toLocaleString()} {s.currency} and send your message.</li>
              <li>If Mix It Up does not confirm the payment, the print is taken back and the System Discord channel is told.</li>
            </ol>
            <p>Mix It Up must answer in the reply to each request (a Webhook Response action). A reply counts as paid when it is a 2xx and does not say <code>ok</code>, <code>success</code> or <code>applied</code> is <code>false</code>.</p>
          </div>

          <PendingButton type="submit" className={primary}>Save Mix It Up</PendingButton>
        </div>
      </form>

      <section className="tcg-panel rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-800">
          <h2 className="font-semibold text-white">Try it</h2>
          <p className="text-xs text-gray-500 mt-0.5">Uses the saved settings. Neither button takes any currency.</p>
        </div>
        <div className="px-6 py-5 flex flex-wrap items-end gap-4">
          <form action={checkBalanceAction} className="flex items-end gap-2">
            <div>
              <label className={label} htmlFor="mx-who">Viewer</label>
              <input id="mx-who" name="who" placeholder="viewer name" className={input} />
            </div>
            <PendingButton type="submit" className={secondary}>Check balance</PendingButton>
          </form>
          <form action={sendTestAction}><PendingButton type="submit" className={secondary}>Send test message</PendingButton></form>
        </div>
      </section>

      <section className="tcg-panel rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-800">
          <h2 className="font-semibold text-white">Recent requests</h2>
          <p className="text-xs text-gray-500 mt-0.5">The last 20 calls to and refusals for Mix It Up. A <em>revoked</em> line is a pull taken back; refund that viewer by hand if Mix It Up did take the currency.</p>
        </div>
        {log.length === 0 ? <p className="px-6 py-5 text-sm text-gray-500">Nothing yet.</p> : (
          <ul className="divide-y divide-gray-800/70 text-sm">
            {log.map((e, i) => (
              <li key={i} className="px-6 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${e.ok ? 'text-emerald-300' : 'text-red-300'}`}>{e.what}</span>
                <span className="font-semibold text-white">{e.username}</span>
                <span className="text-gray-400 min-w-0 break-words">{e.detail}</span>
                <time className="ml-auto text-xs text-gray-600 tabular-nums" dateTime={new Date(e.at).toISOString()}>{new Date(e.at).toISOString().replace('T', ' ').slice(0, 19)} UTC</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

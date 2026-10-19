import { PendingButton } from '../components/PendingButton';
import { Icon } from '@/app/components/Icon';
import type { MixItUpSettings } from '@/lib/mixitup-core';
import { MESSAGE_MAX, MESSAGE_VARS, PULL_ROLES, PULL_ROLE_LABELS } from '@/lib/mixitup-core';
import { saveMixItUpAction, checkBalanceAction, sendTestAction, setStreamBuffAction, clearStreamBuffAction } from './mixitup-actions';
import { MessageField } from './MessageField';
import { PaidPullSetup } from './PaidPullSetup';

const input = 'input w-full';
const label = 'block text-xs font-semibold text-gray-300 mb-1';
const help = 'text-[11px] text-gray-500 mt-1';
const primary = 'rounded-lg bg-yellow-500 px-4 py-2 text-sm font-bold text-black hover:bg-yellow-400 disabled:opacity-60';
const secondary = 'rounded-lg border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-200 hover:border-gray-500 disabled:opacity-60';

/** Mix It Up → Paid pulls: viewers pay a currency for a pack (ROADMAP Track 12). */
export function MixItUpConfig({ settings: s, streamExtra }: { settings: MixItUpSettings; streamExtra: number }) {
  return (
    <div className="space-y-6">
      <form action={saveMixItUpAction} className="card rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-800">
          <h2 className="font-semibold text-white flex items-center gap-2"><Icon name="coins" className="text-yellow-400" />Pay to pull with Mix It Up</h2>
          <p className="text-xs text-gray-500 mt-0.5">When this is on, a pull from the bot checks the viewer&rsquo;s balance first and takes {s.currency} when the card is revealed. When it is off, pulls work exactly as before. Gifting packs from the dashboard never charges.</p>
        </div>
        <div className="px-6 py-5 space-y-5">
          <label className="flex items-center gap-2 text-sm text-white font-semibold">
            <input type="checkbox" name="enabled" defaultChecked={s.enabled} className="toggle toggle-sm toggle-primary" />
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
                <label className={label} htmlFor="mx-limit">Fallback limit</label>
                <input id="mx-limit" name="limit" type="number" min={0} step={1} defaultValue={s.limit} className={input} />
              </div>
              <p className={`${help} col-span-2 -mt-2`}>Used only when a role has no number of its own, so an older save keeps working. 0 = no limit.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:col-span-2">
              {PULL_ROLES.map(role => (
                <div key={role}>
                  <label className={label} htmlFor={`mx-role-${role}`}>{PULL_ROLE_LABELS[role]}</label>
                  <input id={`mx-role-${role}`} name={`roleLimit_${role}`} type="number" min={0} step={1} defaultValue={s.roleLimits[role]} className={input} />
                </div>
              ))}
            </div>
            <p className={`${help} sm:col-span-2`}>Pulls per stream for each role. 0 = no limit. The paid-pull webhook can send <code>role</code> (regular, subscriber, vip, moderator or broadcaster). A missing or unknown role counts as regular, and the channel account is always the broadcaster. A gifted sub does not change these. A viewer&rsquo;s own limit, set on their user page, replaces their role. &ldquo;Per stream&rdquo; follows the live Twitch stream; when the channel is offline it is per day (UTC).</p>
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
              <li>If Mix It Up does not confirm the payment, the edition is taken back and the System Discord channel is told.</li>
            </ol>
            <p>Mix It Up must answer in the reply to each request (a Webhook Response action). A reply counts as paid when it is a 2xx and does not say <code>ok</code>, <code>success</code> or <code>applied</code> is <code>false</code>.</p>
          </div>

          <PendingButton type="submit" className={primary}>Save Mix It Up</PendingButton>
        </div>
      </form>

      <section className="card rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-800">
          <h2 className="font-semibold text-white">Extra pulls this stream</h2>
          <p className="text-xs text-gray-500 mt-0.5">Adds this many pulls for every viewer, on top of their role or personal limit, until this stream ends. A limit of 0 stays unlimited. It stops on its own when the stream ends.</p>
        </div>
        <div className="px-6 py-5 flex flex-wrap items-end gap-4">
          <p className="text-sm text-gray-300 w-full">{streamExtra > 0 ? <>On now: <strong className="text-white">+{streamExtra}</strong> for everyone.</> : 'None for this stream.'}</p>
          <form action={setStreamBuffAction} className="flex items-end gap-2">
            <div>
              <label className={label} htmlFor="mx-stream">Extra pulls</label>
              <input id="mx-stream" name="amount" type="number" min={0} step={1} defaultValue={streamExtra} className={`${input} w-28`} />
            </div>
            <PendingButton type="submit" className={secondary}>Set</PendingButton>
          </form>
          <form action={clearStreamBuffAction}><PendingButton type="submit" className={secondary}>Clear</PendingButton></form>
        </div>
      </section>

      <PaidPullSetup settings={s} />

      <section className="card rounded-2xl overflow-hidden">
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
    </div>
  );
}

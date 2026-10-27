'use client';
import { useState } from 'react';
import { Panel, fieldClass } from '../components/ui';
import { MESSAGE_MAX, MESSAGE_VARS, PRICED_ROLES, PULL_ROLES, PULL_ROLE_LABELS, REPLY_DEFAULTS, REPLY_KEYS, REPLY_LABELS, REPLY_MAX, REPLY_VARS, renderReply, replySample, type MixItUpSettings } from '@/lib/mixitup-core';
import { MessageField } from './MessageField';

const help = 'text-[11px] text-gray-500 leading-relaxed';

/**
 * The Paid pulls form's price, limits and messages, grouped in two cards. A client component only so the sentences a refused pull sends back
 * can be previewed from the price and limit being typed (the payment message has its own preview in MessageField).
 */
export function PaidPullFields({ settings: s }: { settings: MixItUpSettings }) {
  const [cost, setCost] = useState(String(s.cost));
  const [limit, setLimit] = useState(String(s.limit));
  const num = (v: string, min: number, fallback: number) => (Number.isFinite(Number(v)) && v.trim() !== '' && Number(v) >= min ? Math.floor(Number(v)) : fallback);
  const [replies, setReplies] = useState<Record<string, string>>(() => ({ ...s.replies }));
  const sample = replySample({ cost: num(cost, 1, s.cost), limit: num(limit, 0, s.limit), currency: s.currency });
  return (
    <>
      <Panel title="Price and limits" icon="coins" hint="What a pack costs and how many a viewer can pull per stream.">
        <div className="grid grid-cols-2 gap-4 sm:max-w-md">
          <fieldset className="fieldset">
            <legend className="fieldset-legend"><label htmlFor="mx-cost">Price per pack</label></legend>
            <input id="mx-cost" name="cost" type="number" min={1} step={1} value={cost} onChange={e => setCost(e.target.value)} className={fieldClass} />
          </fieldset>
          <fieldset className="fieldset">
            <legend className="fieldset-legend"><label htmlFor="mx-limit">Fallback limit</label></legend>
            <input id="mx-limit" name="limit" type="number" min={0} step={1} value={limit} onChange={e => setLimit(e.target.value)} className={fieldClass} />
          </fieldset>
          <p className={`${help} col-span-2 -mt-2`}>The fallback limit is used only when a role has no number of its own, so an older save keeps working. 0 = no limit.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {PULL_ROLES.map(role => (
            <fieldset key={role} className="fieldset">
              <legend className="fieldset-legend"><label htmlFor={`mx-role-${role}`}>{PULL_ROLE_LABELS[role]}</label></legend>
              <input id={`mx-role-${role}`} name={`roleLimit_${role}`} type="number" min={0} step={1} defaultValue={s.roleLimits[role]} className={fieldClass} />
            </fieldset>
          ))}
        </div>
        <p className={help}>Pulls per stream for each role. 0 = no limit. The paid-pull webhook can send <code>role</code> (regular, subscriber, vip, moderator or broadcaster). A missing or unknown role counts as regular, and the channel account is always the broadcaster. A gifted sub does not change these. A viewer&rsquo;s own limit, set on their user page, replaces their role. &ldquo;Per stream&rdquo; follows the live Twitch stream; when the channel is offline it is per day (UTC).</p>
        <div className="grid grid-cols-2 gap-4 sm:max-w-md">
          {PRICED_ROLES.map(role => (
            <fieldset key={role} className="fieldset">
              <legend className="fieldset-legend"><label htmlFor={`mx-price-${role}`}>{PULL_ROLE_LABELS[role]} price</label></legend>
              <input id={`mx-price-${role}`} name={`priceByRole_${role}`} type="number" min={0} step={1} defaultValue={s.priceByRole[role] ?? ''} placeholder="Base price" className={fieldClass} />
            </fieldset>
          ))}
        </div>
        <p className={help}>What a pack costs a subscriber or a VIP, using the same <code>role</code> as the limits. Empty = the price per pack above. 0 = free (nothing is taken, but it still counts toward their limit). A viewer who is both pays the lower price. The price is fixed when the pull is queued, so changing it while a pack waits on the overlay does not change what that viewer pays.</p>
      </Panel>

      <Panel title="Messages" icon="chat" hint="What Mix It Up is told with each payment, and what the chat replies say. Previews use sample values.">
        <fieldset className="fieldset min-w-0">
          <legend className="fieldset-legend"><label htmlFor="mx-message">Message sent to Mix It Up with the payment</label></legend>
          <MessageField id="mx-message" name="message" defaultValue={s.message} max={MESSAGE_MAX} />
          <p className="text-[11px] text-gray-500 leading-relaxed">Placeholders: {MESSAGE_VARS.map(v => <code key={v} className="mr-1.5">{`{${v}}`}</code>)}</p>
        </fieldset>
        <div>
          <p className="fieldset-legend">Chat replies</p>
          <p className={`${help} mb-2`}>The answer to a !pack carries one of these as <code>message</code>, so the Mix It Up command can post it to chat. Leave a box empty to use the grey default. Placeholders: {REPLY_VARS.map(v => <code key={v} className="mr-1.5">{`{${v}}`}</code>)} (one with no value is left out). The preview uses the price and fallback limit above; with no limit the sample uses 3. A refusal because the stream is offline, pulls are paused or a viewer is blocked keeps its own wording.</p>
          <ul className="space-y-3">
            {REPLY_KEYS.map(key => (
              <li key={key}>
                <label htmlFor={`mx-reply-${key}`} className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{REPLY_LABELS[key]}</label>
                <input id={`mx-reply-${key}`} name={`reply_${key}`} type="text" maxLength={REPLY_MAX} value={replies[key] ?? ''} placeholder={REPLY_DEFAULTS[key]}
                  onChange={e => setReplies(r => ({ ...r, [key]: e.target.value }))} className={fieldClass} />
                <p className="mt-1 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-sm text-gray-300" aria-live="polite">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mr-2">Preview</span>{renderReply(replies[key]?.trim() || REPLY_DEFAULTS[key], sample)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </>
  );
}

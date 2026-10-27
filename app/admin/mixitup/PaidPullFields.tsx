'use client';
import { useState } from 'react';
import { Panel, fieldClass } from '../components/ui';
import { MESSAGE_MAX, MESSAGE_VARS, PULL_ROLES, PULL_ROLE_LABELS, refusalPreviews, type MixItUpSettings } from '@/lib/mixitup-core';
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
  const previews = refusalPreviews({ cost: num(cost, 1, s.cost), limit: num(limit, 0, s.limit), currency: s.currency });
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
      </Panel>

      <Panel title="Messages" icon="chat" hint="What Mix It Up is told with each payment, and what a refused pull says. Previews use sample values.">
        <fieldset className="fieldset min-w-0">
          <legend className="fieldset-legend"><label htmlFor="mx-message">Message sent to Mix It Up with the payment</label></legend>
          <MessageField id="mx-message" name="message" defaultValue={s.message} max={MESSAGE_MAX} />
          <p className="text-[11px] text-gray-500 leading-relaxed">Placeholders: {MESSAGE_VARS.map(v => <code key={v} className="mr-1.5">{`{${v}}`}</code>)}</p>
        </fieldset>
        <div>
          <p className="fieldset-legend">When a pull is refused</p>
          <p className={`${help} mb-2`}>The answer carries this sentence as <code>message</code>, so the Mix It Up command can post it to chat. The wording is fixed. The price and the fallback limit come from the fields above (a viewer&rsquo;s own limit shows in the real sentence; with no fallback limit the sample uses 3).</p>
          <ul className="space-y-1.5">
            {previews.map(p => (
              <li key={p.reason} className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-sm text-gray-300">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500">{p.label}</span>{p.text}
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </>
  );
}

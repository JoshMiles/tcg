import { PendingButton } from '@/app/components/PendingButton';
import type { MixItUpSettings } from '@/lib/mixitup-core';
import { Panel } from '../components/ui';
import { saveMixItUpAction } from './mixitup-actions';
import { PaidPullFields } from './PaidPullFields';

/** Mix It Up → Paid pulls: prices, limits and messages (ROADMAP Track 12). How the site talks to Mix It Up is on the Connection tab. */
export function MixItUpConfig({ settings: s }: { settings: MixItUpSettings }) {
  return (
    <form action={saveMixItUpAction} className="space-y-6">
      <Panel title="Pay to pull with Mix It Up" icon="coins" hint={<>When this is on, a pull from the bot checks the viewer&rsquo;s balance first and takes {s.currency} when the card is revealed. When it is off, pulls work exactly as before. Gifting packs from the dashboard never charges.</>}>
        <label className="flex items-center gap-2 text-sm text-white font-semibold">
          <input type="checkbox" name="enabled" defaultChecked={s.enabled} className="toggle toggle-sm toggle-primary" />
          Charge for pulls
        </label>
        <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-4 text-xs text-gray-400 space-y-1.5">
          <p className="font-semibold text-gray-300">How a pull goes</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>The bot asks for a pack for a viewer. We check their pulls this stream and ask Mix It Up for their balance.</li>
            <li>Not enough, or over the limit: no pack, and the answer carries a <code>message</code> the command can post to chat.</li>
            <li>Enough: the pack opens. When the card is revealed we tell Mix It Up to take {s.cost.toLocaleString()} {s.currency} and send your message.</li>
            <li>If Mix It Up does not confirm the payment, the edition is taken back and the System Discord channel is told.</li>
          </ol>
          {s.connection === 'addresses' && <p>Whatever sits at each address must answer in the reply to each request (Mix It Up has no action that answers a request, so use TCG Bridge or a small service of your own). A reply counts as paid when it is a 2xx and does not say <code>ok</code>, <code>success</code> or <code>applied</code> is <code>false</code>.</p>}
        </div>
      </Panel>

      <PaidPullFields settings={s} />

      <PendingButton type="submit" className="btn btn-primary btn-sm self-start">Save paid pulls</PendingButton>
    </form>
  );
}

import Link from 'next/link';
import { PendingButton } from '@/app/components/PendingButton';
import type { MixItUpSettings } from '@/lib/mixitup-core';
import { Panel } from '../components/ui';
import { saveMixItUpAction } from './mixitup-actions';
import { PaidPullFields } from './PaidPullFields';
import { HappyHourBox, type HappyHourView } from './HappyHourBox';

/** Mix It Up → Paid pulls: prices, limits and messages (ROADMAP Track 12). How the site talks to Mix It Up is on the Connection tab. */
export function MixItUpConfig({ settings: s, happyHour, packs }: { settings: MixItUpSettings; happyHour: HappyHourView | null; packs: { id: string; name: string; price?: number }[] }) {
  return (
    <div className="space-y-6">
    <HappyHourBox running={happyHour} />
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
          {s.connection === 'addresses' && <p>Mix It Up must answer in the reply to each request (a Webhook Response action). A reply counts as paid when it is a 2xx and does not say <code>ok</code>, <code>success</code> or <code>applied</code> is <code>false</code>.</p>}
        </div>
      </Panel>

      <PaidPullFields settings={s} />

      <PendingButton type="submit" className="btn btn-primary btn-sm self-start">Save paid pulls</PendingButton>
    </form>
    <Panel title="Packs viewers can ask for" icon="list" hint={<>A viewer types <code>!pack &lt;name&gt;</code> (the whole name, or the start of it if only one pack starts that way). Prices are set on each pack&rsquo;s editor; the base price is {s.cost.toLocaleString()} {s.currency}. Every paid pull is charged the price of the pack it opens (pack price, else role price, else base), including a plain <code>!pack</code>, which opens a random pack.</>}>
      {packs.length === 0 ? <p className="text-sm text-gray-500">The active season has no pack with cards to open.</p> : (
        <table className="table table-sm">
          <thead><tr><th>Pack</th><th className="text-right">Price</th><th /></tr></thead>
          <tbody>
            {packs.map(p => (
              <tr key={p.id}>
                <td className="font-semibold text-white">{p.name}</td>
                <td className="text-right">{p.price ? <>{p.price.toLocaleString()} {s.currency}</> : <span className="text-gray-500">{s.cost.toLocaleString()} {s.currency} (base)</span>}</td>
                <td className="text-right"><Link href={`/admin/packs/${p.id}?view=settings`} className="link">Edit pack</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
    </div>
  );
}

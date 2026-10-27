import Link from 'next/link';
import { describeBuffDef, type BuffDef } from '@/lib/buffs-core';
import { incomingSetup } from '@/lib/mixitup-setup';
import { CopyCard } from './setup/SetupClient';

/** Mix It Up → Stream Deck (ROADMAP 55.2): one Copy setup card per switched-on buff and per quick action, all for POST /api/webhooks/buff. */
export function StreamDeckTab({ buffs, url, secret }: { buffs: BuffDef[]; url: string; secret: string }) {
  const on = buffs.filter(b => b.streamDeck);
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-300">
        Make a Mix It Up command for each button (Web Request action: POST, JSON; then a Chat Message that says the <code>message</code> field), and run it from the Stream Deck with Mix It Up&rsquo;s plugin.
        To reward one named viewer, set <code>target</code> to <code>viewer</code> and add <code>username</code>; <code>last-pull</code> is whoever pulled last this stream. A button pressed twice within 10 seconds counts once.
      </p>
      <section className="space-y-3">
        <h2 className="font-semibold text-white">Buffs</h2>
        {on.length === 0 && <p className="text-sm text-gray-500">No buff answers the Stream Deck yet. Switch it on for a buff in the <Link href="/admin/buffs" className="link">Buff Editor</Link>.</p>}
        {on.map(b => (
          <CopyCard key={b.id} title={b.name} note={describeBuffDef(b)}
            {...incomingSetup(url, secret, { buff: b.id, target: b.scope === 'community' ? 'everyone' : 'last-pull' })} />
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold text-white">Quick actions</h2>
        <CopyCard title="Extra pulls this stream" note="Adds to everyone's pulls until the stream ends. amount 0 clears it." {...incomingSetup(url, secret, { action: 'stream-pulls', amount: '1' })} />
        <CopyCard title="Happy hour" note="Cheaper paid pulls for a while. amount = minutes (1 to 240); add percent (1 to 99) for a discount, leave it out for free packs. amount 0 ends it." {...incomingSetup(url, secret, { action: 'happy-hour', amount: '30', percent: '50' })} />
        <CopyCard title="Free pack" note="Opens one pack that never charges. Use target viewer with a username to pick the viewer." {...incomingSetup(url, secret, { action: 'free-pack', target: 'last-pull' })} />
      </section>
    </div>
  );
}

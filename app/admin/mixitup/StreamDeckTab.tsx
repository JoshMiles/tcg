import Link from 'next/link';
import { describeBuffDef, type BuffDef } from '@/lib/buffs-core';
import { incomingSetup, REQUEST_ID } from '@/lib/mixitup-setup';
import { CopyCard } from './setup/SetupClient';

/** Mix It Up → Stream Deck (ROADMAP 55.2): one Copy setup card per switched-on buff and per quick action, all for POST /api/webhooks/buff. */
export function StreamDeckTab({ buffs, url, secret }: { buffs: BuffDef[]; url: string; secret: string }) {
  const on = buffs.filter(b => b.streamDeck);
  const card = (title: string, note: string, fields: Record<string, string>) => {
    const all = { ...fields, requestId: REQUEST_ID };
    return <CopyCard key={title} title={title} note={note} {...incomingSetup(url, secret, all)} download={{ kind: 'group', name: title, path: 'buff', fields: all, reply: ['message'] }} />;
  };
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-300">
        Download a Mix It Up command for each button and import it (by hand: a Web Request action, POST, JSON, mapping <code>message</code> to <code>reply</code>, then a Chat Message that says <code>$reply</code>), and run it from the Stream Deck with Mix It Up&rsquo;s plugin.
        To reward one named viewer, set <code>target</code> to <code>viewer</code> and add <code>username</code>; <code>last-pull</code> is whoever pulled last this stream. A button pressed twice within 10 seconds counts once.
      </p>
      <section className="space-y-3">
        <h2 className="font-semibold text-white">Buffs</h2>
        {on.length === 0 && <p className="text-sm text-gray-500">No buff answers the Stream Deck yet. Switch it on for a buff in the <Link href="/admin/buffs" className="link">Buff Editor</Link>.</p>}
        {on.map(b => card(b.name, describeBuffDef(b), { buff: b.id, target: b.scope === 'community' ? 'everyone' : 'last-pull' }))}
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold text-white">Quick actions</h2>
        {card('Extra pulls this stream', "Adds to everyone's pulls until the stream ends. amount 0 clears it.", { action: 'stream-pulls', amount: '1' })}
        {card('Happy hour', 'Cheaper paid pulls for a while. amount = minutes (1 to 240); add percent (1 to 99) for a discount, leave it out for free packs. amount 0 ends it.', { action: 'happy-hour', amount: '30', percent: '50' })}
        {card('Free pack', 'Opens one pack that never charges. Use target viewer with a username to pick the viewer.', { action: 'free-pack', target: 'last-pull' })}
      </section>
    </div>
  );
}

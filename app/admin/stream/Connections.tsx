import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { TONE_WORD, connHref, type ConnId, type ConnItem, type ConnTone } from '@/lib/stream-connections';
import { setupHref } from '@/lib/mixitup-wizard';

const DOT: Record<ConnTone, string> = { ok: 'bg-green-400', warn: 'bg-amber-400', bad: 'bg-red-500', muted: 'bg-gray-500' };

/**
 * The Connections section's layout (ROADMAP 63.4): the list of connections on the left (above the panel on a phone), each a link with a status dot and a
 * one-line state, and the chosen one's panel beside it. The dot's colour is also said in words for a screen reader.
 */
export function Connections({ list, active, setupLabel, children }: { list: ConnItem[]; active: ConnId; setupLabel: string; children: React.ReactNode }) {
  const current = list.find(c => c.id === active)!;
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <nav aria-label="Connections" className="card rounded-2xl p-2 lg:w-72 lg:shrink-0 space-y-0.5">
        {list.map(c => (
          <Link key={c.id} href={connHref(c.id)} scroll={false} aria-current={c.id === active ? 'page' : undefined}
            className={`flex items-start gap-3 rounded-xl px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400 ${c.id === active ? 'bg-gray-800' : 'hover:bg-gray-800/50'}`}>
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[c.tone]}`} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">{c.label}</span>
              <span className="block text-xs text-gray-400"><span className="sr-only">{TONE_WORD[c.tone]}: </span>{c.state}</span>
            </span>
          </Link>
        ))}
        <Link href={setupHref()} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-yellow-400 hover:bg-gray-800/50"><Icon name="wrench" />{setupLabel}</Link>
      </nav>
      <section aria-label={current.label} className="min-w-0 flex-1 space-y-6">{children}</section>
    </div>
  );
}

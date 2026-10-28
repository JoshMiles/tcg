import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/app/components/Icon';
import { CARDS, type CardId } from '@/lib/viewers-cards';
import { HowToggle } from './CardForm';

/** An open What viewers get card: the way back to all of them, its title, one hint line and, when there is more to say, a "How?" button for the rest. */
export function CardFrame({ id, how, children }: { id: CardId; how?: ReactNode; children: ReactNode }) {
  const card = CARDS.find(c => c.id === id)!;
  return (
    <section className="card rounded-2xl overflow-hidden" aria-labelledby={`card-${id}-h`}>
      <div className="px-6 py-5 border-b border-gray-800 space-y-2">
        <Link href="/admin/stream?section=viewers" className="link text-xs font-semibold inline-flex items-center gap-1"><Icon name="chevronLeft" />All rewards</Link>
        <h2 id={`card-${id}-h`} className="font-semibold text-white flex items-center gap-2"><Icon name={card.icon} className="text-yellow-400" />{card.label}</h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-gray-400">{card.line}</p>
          {how && <HowToggle>{how}</HowToggle>}
        </div>
      </div>
      <div className="px-6 py-5 space-y-5">{children}</div>
    </section>
  );
}

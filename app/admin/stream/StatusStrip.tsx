import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import type { StatusStrip as Strip } from '@/lib/stream-page';

/** The top of every Stream section: "All good", or how many things need you with one line and a fix link each. */
export function StatusStrip({ strip }: { strip: Strip }) {
  if (strip.ok) {
    return <div role="status" className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-950/20 px-4 py-2.5 text-sm font-semibold text-green-300"><Icon name="checkCircle" />{strip.title}</div>;
  }
  return (
    <section aria-label="Status" className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-200"><Icon name="warning" />{strip.title}</p>
      <ul className="space-y-1 text-sm">
        {strip.items.map(i => (
          <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="min-w-0 wrap-break-word text-gray-200">{i.line}</span>
            <Link href={i.fix.href} className="link link-primary font-semibold shrink-0">{i.fix.label}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

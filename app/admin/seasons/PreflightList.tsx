import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import type { PreflightItem } from '@/lib/season-preflight';

/** The pre-flight list shown in the Activate confirmation: errors (would break pulls) first, then warnings, each linking to the fix. */
export function PreflightList({ items }: { items: PreflightItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 space-y-1 text-amber-200">
      {items.map((w, i) => (
        <li key={i} className="flex gap-2">
          <Icon name={w.level === 'error' ? 'alert' : 'warning'} className={w.level === 'error' ? 'text-red-400 mt-0.5 shrink-0' : 'text-amber-400 mt-0.5 shrink-0'} />
          <span>
            {w.level === 'error' && <strong className="text-red-300">Would break pulls: </strong>}
            {w.message}
            {w.href && <> <Link href={w.href} target="_blank" className="underline">Fix</Link></>}
          </span>
        </li>
      ))}
    </ul>
  );
}

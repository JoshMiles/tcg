import Link from 'next/link';
import type { MixItUpLogEntry } from '@/lib/mixitup';
import { LOG_FILTERS, filterLog, type LogFilter } from '@/lib/mixitup-page';
import { timeAgo } from '@/lib/site-data';
import { Panel } from '../components/ui';
import { LocalTime } from './LocalTime';

/** The log rows, newest first. Shared by the History log and the Live feed's tests. */
export function LogRows({ log, now, empty = 'Nothing yet.' }: { log: MixItUpLogEntry[]; now: number; empty?: string }) {
  if (log.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <ul className="divide-y divide-gray-800/70 text-sm">
      {log.map((e, i) => (
        <li key={`${e.at}-${i}`} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${e.ok ? 'text-emerald-300' : 'text-red-300'}`}>{e.what}</span>
          <span className="font-semibold text-white">{e.username}</span>
          <span className="text-gray-400 min-w-0 wrap-break-word">{e.detail}</span>
          <span className="sm:ml-auto"><LocalTime at={e.at} ago={timeAgo(e.at, now)} /></span>
        </li>
      ))}
    </ul>
  );
}

/** Mix It Up → Log: the last requests to and refusals for Mix It Up, with a filter kept in the address (`?filter=`). */
export function MixItUpLog({ log, filter, now }: { log: MixItUpLogEntry[]; filter: LogFilter; now: number }) {
  const shown = filterLog(log, filter);
  return (
    <Panel title="Recent requests" icon="list" hint={<>The last 50 requests Mix It Up made to the site (<em>pull</em>, <em>grant</em>, <em>buff</em>, with the refusal reason) and calls the site made to Mix It Up, and the last 20 chat commands. A <em>revoked</em> line is a pull that was not given, or a refund that could not be made; refund that viewer by hand if Mix It Up did take the currency.</>}>
      <nav aria-label="Log filter" className="flex flex-wrap gap-2">
        {LOG_FILTERS.map(f => (
          <Link key={f.id} href={f.id === 'all' ? '/admin/stream?section=history' : `/admin/stream?section=history&filter=${f.id}`} scroll={false} aria-current={f.id === filter ? 'true' : undefined}
            className={`btn btn-sm ${f.id === filter ? 'btn-primary' : 'btn-outline'}`}>{f.label}</Link>
        ))}
      </nav>
      <LogRows log={shown} now={now} empty={log.length === 0 ? 'Nothing yet.' : 'Nothing matches this filter.'} />
    </Panel>
  );
}

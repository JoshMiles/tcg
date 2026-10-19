import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/app/components/Icon';
import { spanText, type ProvStep, type Provenance } from '@/lib/provenance';
import type { Origin } from '@/lib/serials-core';

// A copy's journey on its public page: how long it has existed, who has held it and for how long (a stacked bar), and every step as a
// timeline. Server component. `who` and `plain` are given by the page so private collectors stay masked everywhere.

const PALETTE = ['#facc15', '#38bdf8', '#c084fc', '#34d399', '#fb7185', '#fb923c', '#a3e635', '#f472b6'];

const STEP_ICON: Record<ProvStep['kind'], IconName> = { made: 'cheese', passed: 'trade', offered: 'inbox', returned: 'undo', forged: 'zap', removed: 'trash', ended: 'stop' };
const STEP_TONE: Record<ProvStep['kind'], string> = {
  made: 'bg-yellow-400 text-gray-950', passed: 'bg-sky-400 text-gray-950', offered: 'bg-gray-600 text-white', returned: 'bg-emerald-400 text-gray-950',
  forged: 'bg-fuchsia-400 text-gray-950', removed: 'bg-rose-500 text-white', ended: 'bg-gray-600 text-white',
};

const when = (t: number) => new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';

/** The first step of a copy's journey, worded by how it came to exist: pulled by, given to, forged by (never "made for"). */
function madeStep(origin: Origin | undefined, to: ReactNode | null): ReactNode {
  switch (origin) {
    case 'grant': return to ? <>Given to {to}</> : <>Given as a gift</>;
    case 'upgrade': return to ? <>Forged by {to} in an upgrade</> : <>Forged in an upgrade</>;
    case 'estimated': return to ? <>Already held by {to} when editions were first numbered</> : <>Existed before editions were numbered</>;
    case 'other': return to ? <>Added to {to}&rsquo;s collection</> : <>Added to a collection</>;
    default: return to ? <>Pulled by {to}</> : <>Pulled</>;
  }
}

export function ProvenanceTimeline({ prov, who, plain, seasonId, refs, madeFrom, origin }: {
  prov: Provenance;
  /** A collector as a link (or masked text). */
  who: (name?: string) => ReactNode;
  /** A collector as plain text, masked the same way (for the bar's legend). */
  plain: (name: string) => string;
  seasonId: string;
  /** What the copies this one was forged from / into are called ("#1000042"). */
  refs: Record<string, { uid?: number; n: number }>;
  madeFrom?: string[];
  /** How the copy came to exist, so its first step reads "Pulled by", "Given to" or "Forged by". */
  origin?: Origin;
}) {
  const colour = new Map<string, string>();
  prov.holders.forEach((h, i) => colour.set(h, PALETTE[i % PALETTE.length]));
  const segments = prov.steps.filter(s => s.holder && (s.heldMs ?? 0) > 0);
  const total = segments.reduce((n, s) => n + (s.heldMs ?? 0), 0);
  const ref = (id: string) => {
    const r = refs[id];
    return <Link href={`/copy/${encodeURIComponent(seasonId)}/${id}`} className="text-yellow-300 hover:text-yellow-200 tabular-nums">{r?.uid ? `Edition #${r.uid}` : r ? `print #${r.n}` : 'an edition'}</Link>;
  };

  const tile = (label: string, value: ReactNode, sub?: ReactNode) => (
    <div className="rounded-xl bg-gray-950/60 border border-gray-800 p-3 min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">{label}</p>
      <p className="mt-0.5 font-display text-xl font-bold text-white leading-tight wrap-break-word">{value}</p>
      {sub && <p className="text-xs text-gray-500 wrap-break-word">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tile(prov.state === 'gone' ? 'Lived for' : 'Age', spanText(prov.ageMs))}
        {tile('Holders', prov.holders.length, prov.holders.length === 1 ? 'never left the first collector' : `${prov.trades} trade${prov.trades === 1 ? '' : 's'}`)}
        {tile('Longest hold', prov.longest ? spanText(prov.longest.ms) : 'n/a', prov.longest ? who(prov.longest.who) : undefined)}
        {tile('Right now', prov.state === 'held' ? 'In a collection' : prov.state === 'offer' ? 'In a trade offer' : 'No longer exists')}
      </div>

      {total > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">Who held it, and for how long</p>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-900 border border-gray-800" role="img"
            aria-label={prov.holders.map(h => plain(h)).join(', then ')}>
            {segments.map((s, i) => (
              <span key={i} title={`${plain(s.holder!)}: ${spanText(s.heldMs!)}`} style={{ width: `${Math.max(1.5, ((s.heldMs ?? 0) / total) * 100)}%`, background: colour.get(s.holder!) }} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
            {prov.holders.map(h => (
              <li key={h} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: colour.get(h) }} />{who(h)}</li>
            ))}
          </ul>
        </div>
      )}

      {madeFrom && madeFrom.length > 0 && (
        <p className="text-sm text-gray-400">
          <Icon name="zap" className="text-fuchsia-300 mr-1.5" />Forged in an upgrade from {madeFrom.map((id, i) => <span key={id}>{i > 0 && ', '}{ref(id)}</span>)}.
        </p>
      )}

      <ol className="space-y-4">
        {prov.steps.map((s, i) => (
          <li key={i} className="relative pl-11">
            {i < prov.steps.length - 1 && <span aria-hidden className="absolute left-[15px] top-8 bottom-[-16px] w-px bg-gray-800" />}
            <span className={`absolute left-0 top-0 grid place-items-center h-8 w-8 rounded-full ${STEP_TONE[s.kind]}`}><Icon name={STEP_ICON[s.kind]} /></span>
            <p className="text-sm text-gray-100">
              {s.kind === 'made' && madeStep(origin, s.to ? who(s.to) : null)}
              {s.kind === 'passed' && <>Traded from {who(s.from)} to {who(s.to)}</>}
              {s.kind === 'offered' && <>Put up in a trade offer by {who(s.from)}</>}
              {s.kind === 'returned' && <>Came back to {who(s.to)} from a trade offer</>}
              {s.kind === 'forged' && <>Spent by {who(s.from)} in an upgrade{s.into ? <>, forged into {ref(s.into)}</> : null}</>}
              {s.kind === 'removed' && <>Removed from {who(s.from)}&rsquo;s collection</>}
            </p>
            <p className="text-xs text-gray-500">
              {when(s.t)}
              {s.holder && (s.heldMs ?? 0) > 0 && <> · {i === prov.steps.length - 1 && prov.state === 'held' ? 'held for' : 'kept for'} {spanText(s.heldMs!)}</>}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

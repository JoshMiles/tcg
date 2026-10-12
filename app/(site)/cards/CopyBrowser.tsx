'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { ORIGIN_LABELS, type Origin } from '@/lib/serials-core';
import { VARIANT_LABELS } from '@/lib/variants';
import type { Variant } from '@/lib/types';
import type { DexCopyRow } from '@/app/api/dex-copies/route';

const ENDED: Record<NonNullable<DexCopyRow['ended']>, string> = { upgraded: 'spent in an upgrade', removed: 'removed from the game', gone: 'no longer exists' };

/**
 * Every numbered copy of a card, one version at a time, newest first (the dex card dialog's "Browse every copy"). Each row says who has
 * it now, when it was made and how; pressing it opens the copy's own page with its full history. Fetched only once opened.
 */
export function CopyBrowser({ seasonId, card, versions }: { seasonId: string; card: number; versions: { variant: Variant; made: number }[] }) {
  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<Variant>(versions[0]?.variant ?? 'regular');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ made: number; size: number; rows: DexCopyRow[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setVariant(versions[0]?.variant ?? 'regular'); setPage(0); setData(null); setOpen(false); }, [card]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    let live = true;
    setFailed(false);
    fetch(`/api/dex-copies?season=${encodeURIComponent(seasonId)}&card=${card}&variant=${variant}&page=${page}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (live && d.tracking) setData(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [open, seasonId, card, variant, page]);

  if (versions.length === 0) return null;
  const pages = data ? Math.max(1, Math.ceil(data.made / data.size)) : 1;
  const who = (r: DexCopyRow) =>
    r.holder === null ? <span className="text-gray-500">{ENDED[r.ended ?? 'gone']}</span>
    : r.holder === 'offer' ? <span className="text-gray-400">in a trade offer</span>
    : r.holder === 'private' ? <span className="text-gray-400">a private collector</span>
    : <span className="text-yellow-300 font-bold">@{r.holder}</span>;

  return (
    <details className="group rounded-xl border border-gray-800 bg-gray-950/40" open={open} onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer select-none list-none flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-bold text-gray-300 hover:text-white">
        <span><Icon name="cheese" className="mr-1.5" />Browse every copy</span>
        <span className="text-gray-500 transition-transform group-open:rotate-90" aria-hidden>›</span>
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-3 border-t border-gray-800">
        <div role="group" aria-label="Version" className="flex flex-wrap gap-1.5 pt-3">
          {versions.map(v => (
            <button key={v.variant} type="button" aria-pressed={v.variant === variant} onClick={() => { setVariant(v.variant); setPage(0); setData(null); }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${v.variant === variant ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
              {VARIANT_LABELS[v.variant]} · {v.made.toLocaleString()}
            </button>
          ))}
        </div>
        {failed ? <p className="text-sm text-gray-500">Could not load the copies. Try again in a moment.</p>
          : !data ? <p className="text-sm text-gray-500">Loading…</p>
          : (
            <>
              <ul className="divide-y divide-gray-800/70 rounded-lg border border-gray-800 overflow-hidden text-sm">
                {data.rows.map(r => (
                  <li key={r.id}>
                    <Link href={`/copy/${encodeURIComponent(seasonId)}/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 hover:bg-white/[0.04]">
                      <span className="font-display font-bold text-yellow-300 tabular-nums w-14">#{r.n}{r.est ? '~' : ''}</span>
                      <span className="flex-1 min-w-[8rem]">{who(r)}</span>
                      <span className="text-xs text-gray-500">{ORIGIN_LABELS[r.origin as Origin] ?? 'Added to the collection'}{r.pulledBy && r.pulledBy !== r.holder ? <> · pulled by {r.pulledBy === 'private' ? 'a private collector' : `@${r.pulledBy}`}</> : null} · {new Date(r.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {pages > 1 && (
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Page {page + 1} of {pages} · newest first</span>
                  <span className="flex gap-2">
                    <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2.5 py-1 rounded-lg border border-gray-700 text-gray-300 hover:text-white disabled:opacity-40">← Newer</button>
                    <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)} className="px-2.5 py-1 rounded-lg border border-gray-700 text-gray-300 hover:text-white disabled:opacity-40">Older →</button>
                  </span>
                </div>
              )}
              <p className="text-[11px] text-gray-600">Open a copy for its full history. A &ldquo;~&rdquo; means its number is an estimate (it existed before serial numbers).</p>
            </>
          )}
      </div>
    </details>
  );
}

import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { UserInput } from '@/app/components/UserInput';
import { getActiveSeason, getPackCards, getPacksForSeason, listSeasons } from '@/lib/kv';
import { getOwnerCopies, liveCounts, mintedCounts, pageCopies, serialStats } from '@/lib/serials';
import { ORIGIN_LABELS, isEscrow, serialLabel, type Copy } from '@/lib/serials-core';
import { VARIANTS, VARIANT_LABELS, encodeEntry } from '@/lib/variants';
import type { Variant } from '@/lib/types';
import { clearPotwAction, pickPotwAgainAction } from '../serial-actions';
import { PendingButton } from '../components/PendingButton';
import { getPotw } from '@/lib/print-of-week-store';
import { Chip, EmptyState, PageHeader, Panel, Tile, selectClass } from '../components/ui';

export const metadata = { title: 'Prints · Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

const PAGE = 25;
const when = (t: number) => `${new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;
const field = 'rounded-xl bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500';

type SP = { done?: string; err?: string; season?: string; card?: string; variant?: string; holder?: string; page?: string };

export default async function SerialsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const seasons = (await listSeasons()).filter(s => s.status !== 'draft');
  const season = seasons.find(s => s.id === sp.season) ?? (await getActiveSeason()) ?? seasons[0];
  if (!season) return <div className="space-y-6"><PageHeader title="Prints" icon="cheese" /><EmptyState icon="cheese" title="No published seasons yet">Print numbers belong to a season&rsquo;s cards.</EmptyState></div>;

  const c = season.collectionName;
  const stats = await serialStats(c);
  const potw = await getPotw();
  // The cards the season can have copies of: draft packs are never drawn, so they are left out (as on the leaderboard).
  const packs = (await getPacksForSeason(season)).filter(p => p.status !== 'draft');
  const cards = (await Promise.all(packs.map(async p => (await getPackCards(p.id)).map(card => ({ number: card.number, name: card.name, stars: card.stars, pack: p.name }))))).flat().sort((a, b) => a.number - b.number);
  const nameOf = (n: number) => cards.find(x => x.number === n)?.name ?? `#${n}`;

  const card = Number(sp.card) || 0;
  const variant = (VARIANTS as readonly string[]).includes(sp.variant ?? '') ? (sp.variant as Variant) : 'regular';
  const holder = (sp.holder ?? '').trim().replace(/^@/, '').toLowerCase();
  const pageNo = Math.max(0, (Number(sp.page) || 1) - 1);
  const link = (o: Partial<SP>) => {
    const q = new URLSearchParams();
    const m = { season: season.id, card: sp.card, variant: sp.variant, holder: sp.holder, ...o } as Record<string, string | undefined>;
    for (const [k, v] of Object.entries(m)) if (v) q.set(k, v);
    return `/admin/serials?${q.toString()}`;
  };

  if (!stats.tracking) {
    return (
      <div className="space-y-6">
        <PageHeader title="Prints" icon="cheese" subtitle="Every print of every card, with its number, holder and history." />
        <EmptyState icon="cheese" title={`${season.name} has no numbered prints yet`}>Existing prints are numbered once, from Settings → Twitch &amp; viewers → Card prints. After that every new print is numbered as it is made.</EmptyState>
        <p className="text-center"><Link href="/admin/settings?tab=viewers" className="tcg-btn px-4 py-2 rounded-xl text-sm">Open settings</Link></p>
      </div>
    );
  }

  // What to list: a holder's copies, or one card + version by number; otherwise the overview grid.
  let rows: Copy[] = [];
  let total = 0;
  let mode: 'overview' | 'holder' | 'card' = 'overview';
  const [made, live] = await Promise.all([mintedCounts(c), liveCounts(c)]);
  if (holder) {
    mode = 'holder';
    rows = (await getOwnerCopies(c, holder)).sort((a, b) => a.card - b.card || VARIANTS.indexOf(a.variant) - VARIANTS.indexOf(b.variant) || a.n - b.n);
    total = rows.length;
    rows = rows.slice(pageNo * PAGE, pageNo * PAGE + PAGE);
  } else if (card) {
    mode = 'card';
    const p = await pageCopies(c, card, variant, pageNo, PAGE);
    rows = p.copies;
    total = p.made;
  }
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="space-y-6">
      <PageHeader title="Prints" icon="cheese" subtitle="Every print of every card, with its number, holder and history. Open a print to give it to someone or remove it." />

      {sp.done && <p role="status" className="rounded-xl border border-green-500/30 bg-green-950/30 text-green-300 px-4 py-2.5 text-sm"><Icon name="check" className="mr-1.5" />{sp.done}</p>}
      {sp.err && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/30 text-red-300 px-4 py-2.5 text-sm"><Icon name="warning" className="mr-1.5" />{sp.err}</p>}

      <Panel title="Print of the week" icon="sparkles" hint="Shown on the home page. Picked every Sunday evening from the active season; you can pick again or clear it.">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-300 min-w-0 flex-1 basis-64">
            {potw
              ? <><Link href={`/admin/serials/${encodeURIComponent(potw.seasonId)}/${potw.copyId}`} className="font-bold text-yellow-300 hover:text-yellow-200 tabular-nums">Print #{potw.uid}</Link> · {potw.reason} · score {potw.score} · chosen {when(potw.chosenAt)} by {potw.by === 'auto' ? 'the weekly job' : ['password', 'admin'].includes(potw.by) ? 'an admin' : `@${potw.by}`}</>
              : <span className="text-gray-500">Nothing is featured. The home page shows no print of the week.</span>}
          </p>
          <form action={pickPotwAgainAction}><PendingButton type="submit" className="px-4 py-2 text-sm font-bold rounded-lg border border-gray-600 text-gray-100 hover:border-yellow-500/60"><Icon name="refresh" className="mr-1.5" />Pick again now</PendingButton></form>
          {potw && <form action={clearPotwAction}><PendingButton type="submit" className="px-4 py-2 text-sm font-bold rounded-lg border border-red-500/40 text-red-300 hover:bg-red-950/40"><Icon name="trash" className="mr-1.5" />Clear</PendingButton></form>}
        </div>
      </Panel>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Tile label="Prints made" icon="cheese" value={stats.minted.toLocaleString()} sub={season.name} />
        <Tile label="Held now" icon="users" value={stats.live.toLocaleString()} sub="in collections or offers" />
        <Tile label="Retired" icon="trash" value={stats.retired.toLocaleString()} sub="spent, traded away for good or removed" />
        <Tile label="Cards" icon="cards" value={cards.length} sub="in this season" />
      </div>

      <form method="get" className="tcg-panel rounded-2xl p-4 flex flex-wrap items-end gap-3">
        {seasons.length > 1 && (
          <label className="text-xs text-gray-500 space-y-1">Season
            <select name="season" defaultValue={season.id} className={`${selectClass} block`}>{seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </label>
        )}
        <label className="text-xs text-gray-500 space-y-1">Card
          <select name="card" defaultValue={card ? String(card) : ''} className={`${selectClass} block max-w-[16rem]`}>
            <option value="">All cards</option>
            {cards.map(x => <option key={x.number} value={x.number}>#{x.number} {x.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500 space-y-1">Version
          <select name="variant" defaultValue={variant} className={`${selectClass} block`}>{VARIANTS.map(v => <option key={v} value={v}>{VARIANT_LABELS[v]}</option>)}</select>
        </label>
        <label className="text-xs text-gray-500 space-y-1">Holder
          <UserInput name="holder" defaultValue={holder} placeholder="any viewer" wrapperClassName="relative block" className={`${field} block w-48`} />
        </label>
        <button type="submit" className="tcg-btn px-4 py-2 rounded-xl text-sm"><Icon name="search" className="mr-1.5" />Show</button>
        {(card || holder) && <Link href={`/admin/serials?season=${encodeURIComponent(season.id)}`} className="px-3 py-2 text-sm text-gray-400 hover:text-white">Clear</Link>}
      </form>

      {mode === 'overview' ? (
        <Panel title="Every card" icon="cards" hint="Prints made of each version, with how many are held right now in brackets. Click one to list its prints by number.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] uppercase tracking-wider text-gray-500 text-left border-b border-gray-800">
                <th className="py-2 pr-3">#</th><th className="py-2 pr-3">Card</th>
                {VARIANTS.map(v => <th key={v} className="py-2 px-2 text-right">{VARIANT_LABELS[v]}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-800/60">
                {cards.map(x => (
                  <tr key={x.number} className="hover:bg-white/[0.02]">
                    <td className="py-1.5 pr-3 text-gray-600 tabular-nums">{x.number}</td>
                    <td className="py-1.5 pr-3 text-gray-200">{x.name} <span className="text-yellow-500/80">{'★'.repeat(x.stars)}</span></td>
                    {VARIANTS.map(v => {
                      const m = made.get(encodeEntry(x.number, v)) ?? 0;
                      const l = live.get(encodeEntry(x.number, v)) ?? 0;
                      return (
                        <td key={v} className="py-1.5 px-2 text-right tabular-nums">
                          {m === 0 ? <span className="text-gray-700">-</span> : <Link href={link({ card: String(x.number), variant: v, holder: undefined })} className="text-yellow-300 hover:text-yellow-200">{m.toLocaleString()} <span className="text-gray-500">({l.toLocaleString()})</span></Link>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <Panel
          title={mode === 'holder' ? <>@{holder}&rsquo;s prints</> : <>{nameOf(card)}</>}
          icon="cheese"
          hint={mode === 'holder' ? `${total.toLocaleString()} prints held` : `${total.toLocaleString()} ${VARIANT_LABELS[variant]} prints made`}
          actions={mode === 'card' ? (
            <div className="flex gap-1">{VARIANTS.map(v => {
              const m = made.get(encodeEntry(card, v)) ?? 0;
              return <Link key={v} href={link({ variant: v, holder: undefined, page: undefined })} aria-current={v === variant ? 'true' : undefined} className={`px-2.5 py-1 rounded-full text-xs font-bold border ${v === variant ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:text-white'} ${m === 0 ? 'opacity-40' : ''}`}>{VARIANT_LABELS[v]} · {m}</Link>;
            })}</div>
          ) : undefined}
        >
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">{mode === 'holder' ? 'That viewer holds no numbered prints.' : 'No prints of this version have been made.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-[10px] uppercase tracking-wider text-gray-500 text-left border-b border-gray-800">
                  <th className="py-2 pr-3">Print</th>{mode === 'holder' && <th className="py-2 pr-3">Card</th>}<th className="py-2 pr-3">Held by</th><th className="py-2 pr-3">Created</th><th className="py-2 pr-3">Origin</th><th className="py-2" />
                </tr></thead>
                <tbody className="divide-y divide-gray-800/60">
                  {rows.map(r => {
                    const href = `/admin/serials/${encodeURIComponent(season.id)}/${r.id}`;
                    return (
                      <tr key={r.id} className="hover:bg-white/[0.02]">
                        <td className="py-2 pr-3"><Link href={href} className="font-display font-bold text-yellow-300 hover:text-yellow-200 tabular-nums">{serialLabel(r, VARIANT_LABELS)}{r.est ? '~' : ''}</Link></td>
                        {mode === 'holder' && <td className="py-2 pr-3 text-gray-200">{nameOf(r.card)}</td>}
                        <td className="py-2 pr-3">
                          {!r.owner ? <Chip tone="gray">retired</Chip> : isEscrow(r.owner) ? <Chip tone="amber">in a trade offer</Chip> : <Link href={`/admin/users/${encodeURIComponent(r.owner)}`} className="text-gray-200 hover:text-white">@{r.owner}</Link>}
                        </td>
                        <td className="py-2 pr-3 text-gray-400 whitespace-nowrap">{when(r.at)}</td>
                        <td className="py-2 pr-3 text-gray-500">{ORIGIN_LABELS[r.origin]}</td>
                        <td className="py-2 text-right"><Link href={href} className="text-xs text-gray-400 hover:text-white">Details →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-between pt-2 text-sm">
              <span className="text-gray-500">Page {pageNo + 1} of {pages}</span>
              <span className="flex gap-2">
                {pageNo > 0 && <Link href={link({ page: String(pageNo) })} className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:text-white">← Previous</Link>}
                {pageNo + 1 < pages && <Link href={link({ page: String(pageNo + 2) })} className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:text-white">Next →</Link>}
              </span>
            </div>
          )}
          <p className="text-[11px] text-gray-600">{mode === 'card' ? 'Newest first. ' : ''}A “~” means the print existed before editions were numbered and its order is an estimate.</p>
        </Panel>
      )}
    </div>
  );
}

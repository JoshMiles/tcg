import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { UserInput } from '@/app/components/UserInput';
import { getActiveSeason, getCollection, getPackCards, getPacksForSeason, listSeasons } from '@/lib/kv';
import { findByUid, getCopy, getOwnerCopies, inOfferCount, lastUid, liveCounts, mintedCounts, pageCopies, serialStats } from '@/lib/serials';
import { ORIGIN_LABELS, entryOf, isEscrow, parseCopyId, type Copy } from '@/lib/serials-core';
import { ORIGINS, cleanHolder, filterEditions, parseOrigin, parsePrintSearch } from '@/lib/serials-view';
import { VARIANTS, VARIANT_LABELS, encodeEntry } from '@/lib/variants';
import { serialMultiplier } from '@/lib/scoring-core';
import { getScoringSettings } from '@/lib/scoring';
import { cardThumbUrl } from '@/lib/card-art';
import { getRarity } from '@/lib/rarity';
import type { Variant } from '@/lib/types';
import { backfillSerialsAction } from '../settings/actions';
import { clearPotwAction, pickPotwAgainAction } from '../serial-actions';
import { ConfirmButton } from '../components/ConfirmButton';
import { PendingButton } from '../components/PendingButton';
import { getPotw } from '@/lib/print-of-week-store';
import { Chip, EmptyState, PageHeader, Panel, Tile, selectClass } from '../components/ui';
import { PrintDetail } from './PrintDetail';

export const metadata = { title: 'Prints · Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

const PAGE = 120;       // edition chips per page
const FILTER_CAP = 600; // editions read when a holder / origin filter has to look at all of them
const when = (t: number) => `${new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;
const field = 'input';

type SP = { done?: string; err?: string; season?: string; card?: string; v?: string; variant?: string; holder?: string; origin?: string; q?: string; page?: string; print?: string };

export default async function SerialsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const seasons = (await listSeasons()).filter(s => s.status !== 'draft');
  const season = seasons.find(s => s.id === sp.season) ?? (await getActiveSeason()) ?? seasons[0];
  if (!season) return <div className="space-y-6"><PageHeader title="Prints" icon="cheese" /><EmptyState icon="cheese" title="No published seasons yet">Print numbers belong to a season&rsquo;s cards.</EmptyState></div>;

  const c = season.collectionName;
  const stats = await serialStats(c);
  if (!stats.tracking) {
    return (
      <div className="space-y-6">
        <PageHeader title="Prints" icon="cheese" subtitle="Every print of every card, with its number, holder and history." />
        <EmptyState icon="cheese" title={`${season.name} has no numbered prints yet`}>Existing prints are numbered once. After that every new print is numbered as it is made.</EmptyState>
        <form action={backfillSerialsAction.bind(null, season.id)} className="text-center">
          <ConfirmButton
            title={`Number the prints in ${season.name}?`}
            confirmLabel="Number them"
            message={<>Every print that exists now is given an edition number, in the order the collection stores them, marked <strong className="text-white">estimated</strong> because the true pull order wasn&apos;t recorded. Nothing in any collection changes. Do this once, ideally when no packs are being opened.</>}
            className="tcg-btn px-4 py-2 text-sm rounded-xl"
          >
            Number existing prints
          </ConfirmButton>
        </form>
      </div>
    );
  }

  // ── The cards the season can have prints of (draft packs are never drawn, so they are left out, as on the leaderboard) ──
  const packs = (await getPacksForSeason(season)).filter(p => p.status !== 'draft');
  const cards = (await Promise.all(packs.map(async p => (await getPackCards(p.id)).map(card => ({ number: card.number, name: card.name, stars: card.stars, pack: p.name, imageUrl: card.imageUrl }))))).flat().sort((a, b) => a.number - b.number);
  const cardOf = (n: number) => cards.find(x => x.number === n);
  const nameOf = (n: number) => cardOf(n)?.name ?? `#${n}`;

  // ── The search box: a print number jumps to that print, a login lists that viewer's prints, a card name narrows the list ──
  const search = parsePrintSearch(sp.q);
  const card = Number(sp.card) || 0;
  const vParam = sp.v ?? sp.variant ?? '';
  const holder = cleanHolder(sp.holder);
  const origin = parseOrigin(sp.origin);
  const pageNo = Math.max(0, (Number(sp.page) || 1) - 1);
  const mk = (o: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const m: Record<string, string | undefined> = { season: season.id, card: sp.card, v: vParam, holder: sp.holder, origin: sp.origin, q: sp.q, print: sp.print, ...o };
    for (const [k, v] of Object.entries(m)) if (v) q.set(k, v);
    return `/admin/serials?${q.toString()}`;
  };

  let searchNote = '';
  let searchHolder = '';
  let nameMatches: number[] | null = null;
  if (search.kind === 'uid') {
    const hit = await findByUid(search.uid);
    const target = hit ? seasons.find(s => s.collectionName === hit.collection) : null;
    const parsed = hit ? parseCopyId(hit.copyId) : null;
    if (hit && target && parsed) {
      const to = new URLSearchParams({ season: target.id, card: String(parsed.card), v: parsed.variant, print: hit.copyId });
      redirect(`/admin/serials?${to.toString()}`);
    }
    searchNote = `No print has the number #${search.uid}.`;
  } else if (search.kind === 'text') {
    const text = search.text.replace(/^@/, '').toLowerCase();
    const owners = await getCollection(c);
    if (Object.prototype.hasOwnProperty.call(owners, text)) searchHolder = text;
    else {
      nameMatches = cards.filter(x => x.name.toLowerCase().includes(text) || String(x.number) === text).map(x => x.number);
      if (nameMatches.length === 0) searchNote = `Nothing matches "${search.text}": no print number, viewer or card name.`;
    }
  }
  // A viewer's login in the search lists their prints; a holder filter inside an open card only narrows that card's editions.
  const holderMode = searchHolder || (card ? '' : holder);

  const [made, live, offers, last, potw, scoring] = await Promise.all([mintedCounts(c), liveCounts(c), inOfferCount(c), lastUid(), getPotw(), getScoringSettings()]);
  const listed = nameMatches ? cards.filter(x => nameMatches!.includes(x.number)) : cards;
  const firstVariant = (n: number): Variant => VARIANTS.find(v => (made.get(encodeEntry(n, v)) ?? 0) > 0) ?? 'regular';
  const variant: Variant = (VARIANTS as readonly string[]).includes(vParam) ? (vParam as Variant) : card ? firstVariant(card) : 'regular';
  const openCard = card || (nameMatches?.length === 1 ? nameMatches[0] : 0);

  // ── Editions of the open card + version, or the prints of one holder ──
  let editions: Copy[] = [];
  let totalEditions = 0;
  let capped = false;
  if (holderMode) {
    const mine = (await getOwnerCopies(c, holderMode)).filter(x => !origin || x.origin === origin);
    editions = mine.sort((a, b) => a.card - b.card || VARIANTS.indexOf(a.variant) - VARIANTS.indexOf(b.variant) || a.n - b.n);
    totalEditions = editions.length;
  } else if (openCard) {
    const total = made.get(encodeEntry(openCard, variant)) ?? 0;
    const narrowed = !!(origin || holder);
    const p = await pageCopies(c, openCard, variant, narrowed ? 0 : pageNo, narrowed ? FILTER_CAP : PAGE, true);
    capped = narrowed && total > FILTER_CAP;
    editions = narrowed ? filterEditions(p.copies, { holder, origin }) : p.copies;
    totalEditions = narrowed ? editions.length : total;
  }
  const pages = holderMode || origin || holder ? 1 : Math.max(1, Math.ceil(totalEditions / PAGE));

  // ── The open print, shown in the side panel ──
  const printId = parseCopyId(sp.print ?? '') ? sp.print! : '';
  const printCopy = printId ? await getCopy(c, printId) : null;
  const listUrl = mk({ print: undefined, done: undefined, err: undefined });
  const printLabel = printCopy ? `${printCopy.variant === 'regular' ? '' : `${VARIANT_LABELS[printCopy.variant]} `}${nameOf(printCopy.card)}` : '';

  const chip = (r: Copy, withName: boolean) => {
    const bonus = serialMultiplier(r.n, scoring) > 1;
    const active = r.id === printId;
    return (
      <li key={r.id}>
        <Link href={mk({ print: r.id, done: undefined, err: undefined })} scroll={false} aria-current={active ? 'true' : undefined}
          className={`block rounded-lg border px-2 py-1.5 min-w-0 transition-colors ${active ? 'border-yellow-500 bg-yellow-500/10' : 'border-gray-800 bg-gray-950/60 hover:border-gray-600'}`}>
          <span className="flex items-center justify-between gap-1">
            <span className={`font-display font-bold tabular-nums text-sm ${bonus ? 'text-yellow-300' : 'text-gray-100'}`}>#{r.n}{r.est ? '~' : ''}</span>
            {bonus && <span title="Earns an edition bonus" aria-label="Earns an edition bonus" className="text-yellow-400 text-xs">★</span>}
          </span>
          {withName && <span className="block truncate text-[11px] text-gray-300">{VARIANTS.indexOf(r.variant) > 0 ? `${VARIANT_LABELS[r.variant]} ` : ''}{nameOf(r.card)}</span>}
          {r.uid ? <span className="block text-[10px] text-gray-500 tabular-nums">{r.uid}</span> : null}
          <span className="block truncate text-[11px] text-gray-400">{!r.owner ? 'retired' : isEscrow(r.owner) ? 'in an offer' : `@${r.owner}`}</span>
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Prints" icon="cheese" subtitle="Every print of every card, with its number, holder and history. Open a card to see its editions, and a print to give it away or remove it." />

      {sp.done && <p role="status" className="rounded-xl border border-green-500/30 bg-green-950/30 text-green-300 px-4 py-2.5 text-sm"><Icon name="check" className="mr-1.5" />{sp.done}</p>}
      {sp.err && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/30 text-red-300 px-4 py-2.5 text-sm"><Icon name="warning" className="mr-1.5" />{sp.err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile label="Prints made" icon="cheese" value={stats.minted.toLocaleString()} sub={season.name} />
        <Tile label="Held" icon="users" value={(stats.live - offers).toLocaleString()} sub="in collections" />
        <Tile label="In offers" icon="trade" value={offers.toLocaleString()} sub="held by open trades" />
        <Tile label="Retired" icon="trash" value={stats.retired.toLocaleString()} sub="spent, traded away or removed" />
        <Tile label="Last numbered" icon="cheese" value={last ? `#${last}` : '-'} sub="newest print number" />
        <Tile label="Numbering" icon="check" tone="green" value="Tracking" sub="Give print numbers in Settings" href="/admin/settings?tab=viewers" />
      </div>

      <form method="get" className="tcg-panel rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="season" value={season.id} />
        <label className="text-xs text-gray-500 space-y-1 flex-1 basis-64">Search
          <span className="relative block">
            <input name="q" defaultValue={sp.q ?? ''} placeholder="#1023381, a viewer's login or a card name" aria-label="Search prints" className={`${field} block w-full`} />
          </span>
        </label>
        {seasons.length > 1 && (
          <label className="text-xs text-gray-500 space-y-1">Season
            <select name="season" defaultValue={season.id} className={`${selectClass} block`}>{seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </label>
        )}
        <button type="submit" className="tcg-btn px-4 py-2 rounded-xl text-sm"><Icon name="search" className="mr-1.5" />Search</button>
        {(sp.q || card || holder || origin) && <Link href={`/admin/serials?season=${encodeURIComponent(season.id)}`} className="px-3 py-2 text-sm text-gray-400 hover:text-white">Clear</Link>}
      </form>
      {searchNote && <p role="status" className="text-sm text-amber-300">{searchNote}</p>}

      {holderMode ? (
        <Panel
          title={<>@{holderMode}&rsquo;s prints</>}
          icon="cheese"
          hint={`${totalEditions.toLocaleString()} held. Click a print to open it.`}
          actions={<form method="get" className="flex items-center gap-2">
            <input type="hidden" name="season" value={season.id} /><input type="hidden" name="holder" value={holderMode} />
            <select name="origin" defaultValue={origin} aria-label="Origin" className={`${selectClass} max-w-44`}><option value="">Any origin</option>{ORIGINS.map(o => <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>)}</select>
            <button type="submit" className="px-3 py-2 text-sm rounded-xl border border-gray-700 text-gray-300 hover:text-white">Filter</button>
          </form>}
        >
          {editions.length === 0 ? <p className="text-sm text-gray-500 py-6 text-center">That viewer holds no numbered prints.</p> : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-1.5">{editions.slice(0, 600).map(r => chip(r, true))}</ul>
          )}
          {editions.length > 600 && <p className="text-[11px] text-gray-600">Showing the first 600.</p>}
        </Panel>
      ) : (
        <Panel title="Every card" icon="cards" hint="Prints made of each version, with how many are held right now in brackets. Open a card to see its editions.">
          {listed.length === 0 ? <p className="text-sm text-gray-500 py-6 text-center">No cards to show.</p> : (
            <ul className="divide-y divide-gray-800/60">
              {listed.map(x => {
                const open = x.number === openCard;
                const rarity = getRarity(x.stars);
                return (
                  <li key={x.number} className="py-1.5">
                    <Link href={open ? mk({ card: undefined, v: undefined, holder: undefined, origin: undefined, page: undefined, print: undefined }) : mk({ card: String(x.number), v: undefined, holder: undefined, origin: undefined, page: undefined, print: undefined })} aria-expanded={open}
                      className="flex items-center gap-3 rounded-lg px-1.5 py-1 hover:bg-white/3">
                      {x.imageUrl ? <img src={cardThumbUrl(x.imageUrl)} alt="" loading="lazy" className="w-8 h-11 object-cover rounded-sm shrink-0 border" style={{ borderColor: rarity?.hex }} /> : <span className="w-8 h-11 rounded-sm bg-gray-800 shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-gray-100 truncate"><span className="text-gray-600 tabular-nums mr-1.5">{x.number}</span>{x.name} <span className="text-yellow-500/80">{'★'.repeat(x.stars)}</span></span>
                        <span className="flex flex-wrap gap-x-3 text-[11px] text-gray-500 tabular-nums">
                          {VARIANTS.map(v => { const m = made.get(encodeEntry(x.number, v)) ?? 0; return m === 0 ? null : <span key={v}>{VARIANT_LABELS[v]} <span className="text-yellow-300">{m.toLocaleString()}</span> ({(live.get(encodeEntry(x.number, v)) ?? 0).toLocaleString()})</span>; })}
                          {VARIANTS.every(v => !(made.get(encodeEntry(x.number, v)))) && <span className="text-gray-600">none made yet</span>}
                        </span>
                      </span>
                      <Icon name={open ? 'chevronUp' : 'chevronDown'} className="text-gray-500 shrink-0" />
                    </Link>

                    {open && (
                      <div className="mt-2 ml-0 sm:ml-11 rounded-xl border border-gray-800 bg-gray-900/60 p-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {VARIANTS.map(v => {
                            const m = made.get(encodeEntry(x.number, v)) ?? 0;
                            return <Link key={v} href={mk({ v, page: undefined, print: undefined })} aria-current={v === variant ? 'true' : undefined} className={`px-2.5 py-1 rounded-full text-xs font-bold border ${v === variant ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:text-white'} ${m === 0 ? 'opacity-40' : ''}`}>{VARIANT_LABELS[v]} · {m}</Link>;
                          })}
                        </div>
                        <form method="get" className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="season" value={season.id} /><input type="hidden" name="card" value={x.number} /><input type="hidden" name="v" value={variant} />
                          <label className="text-xs text-gray-500 space-y-1">Holder
                            <UserInput name="holder" defaultValue={holder} placeholder="a viewer, offer or retired" wrapperClassName="relative block" className={`${field} block w-44 max-w-full`} />
                          </label>
                          <label className="text-xs text-gray-500 space-y-1 min-w-0 max-w-full">Origin
                            <select name="origin" defaultValue={origin} className={`${selectClass} block max-w-full`}><option value="">Any</option>{ORIGINS.map(o => <option key={o} value={o}>{ORIGIN_LABELS[o]}</option>)}</select>
                          </label>
                          <button type="submit" className="px-3 py-2 text-sm rounded-xl border border-gray-700 text-gray-300 hover:text-white">Filter</button>
                          {(holder || origin) && <Link href={mk({ holder: undefined, origin: undefined, page: undefined })} className="px-2 py-2 text-sm text-gray-400 hover:text-white">Clear filters</Link>}
                        </form>
                        {editions.length === 0 ? <p className="text-sm text-gray-500 py-3 text-center">{holder || origin ? 'No editions match these filters.' : 'No prints of this version have been made.'}</p> : (
                          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-1.5">{editions.map(r => chip(r, false))}</ul>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                          <span>{totalEditions.toLocaleString()} {holder || origin ? 'match' : `${VARIANT_LABELS[variant]} made`}. Oldest first. A &ldquo;~&rdquo; marks an estimated number; a star earns an edition bonus.{capped && ` Filters look at the first ${FILTER_CAP} only.`}</span>
                          {pages > 1 && (
                            <span className="flex items-center gap-2">
                              <span>Page {pageNo + 1} of {pages}</span>
                              {pageNo > 0 && <Link href={mk({ page: String(pageNo), print: undefined })} className="px-2.5 py-1 rounded-lg border border-gray-700 text-gray-300 hover:text-white">Previous</Link>}
                              {pageNo + 1 < pages && <Link href={mk({ page: String(pageNo + 2), print: undefined })} className="px-2.5 py-1 rounded-lg border border-gray-700 text-gray-300 hover:text-white">Next</Link>}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      <Panel title="Print of the week" icon="sparkles" hint="Shown on the home page. Picked every Sunday evening from the active season; you can pick again or clear it.">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-300 min-w-0 flex-1 basis-64">
            {potw
              ? <><Link href={mk({ season: potw.seasonId, print: potw.copyId, card: String(potw.copyId.split('.')[0]), v: VARIANTS[Number(potw.copyId.split('.')[1])] })} className="font-bold text-yellow-300 hover:text-yellow-200 tabular-nums">Print #{potw.uid}</Link> · {potw.reason} · score {potw.score} · chosen {when(potw.chosenAt)} by {potw.by === 'auto' ? 'the weekly job' : ['password', 'admin'].includes(potw.by) ? 'an admin' : `@${potw.by}`}</>
              : <span className="text-gray-500">Nothing is featured. The home page shows no print of the week.</span>}
          </p>
          <form action={pickPotwAgainAction}><PendingButton type="submit" className="px-4 py-2 text-sm font-bold rounded-lg border border-gray-600 text-gray-100 hover:border-yellow-500/60"><Icon name="refresh" className="mr-1.5" />Pick again now</PendingButton></form>
          {potw && <form action={clearPotwAction}><PendingButton type="submit" className="px-4 py-2 text-sm font-bold rounded-lg border border-red-500/40 text-red-300 hover:bg-red-950/40"><Icon name="trash" className="mr-1.5" />Clear</PendingButton></form>}
        </div>
      </Panel>

      {/* The open print: a side panel, a full-screen sheet on phones. Closing is a plain link, so the view (and its filters) stays as it was. */}
      {printId && (
        <>
          <Link href={listUrl} aria-label="Close the print" className="fixed inset-0 z-40 bg-black/50 hidden sm:block" />
          <aside role="dialog" aria-label={printCopy ? `Print ${printLabel} number ${printCopy.n}` : 'Print'} className="fixed inset-0 sm:left-auto sm:w-136 z-50 overflow-y-auto bg-gray-950 sm:border-l border-gray-800 shadow-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-lg font-bold text-white truncate">{printCopy ? <>{printLabel} <span className="text-yellow-400 tabular-nums">#{printCopy.n}</span></> : 'Print not found'}</p>
                {printCopy?.uid ? <p className="text-sm text-gray-400 tabular-nums">Print #{printCopy.uid}</p> : null}
              </div>
              <span className="flex items-center gap-2 shrink-0">
                {printCopy && <Link href={`/admin/serials/${encodeURIComponent(season.id)}/${printCopy.id}`} className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-300 hover:text-white">Full page</Link>}
                <Link href={listUrl} className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-gray-600 text-gray-100 hover:border-yellow-500/60"><Icon name="x" className="mr-1" />Close</Link>
              </span>
            </div>
            {printCopy ? (
              <>
                <p className="text-xs text-gray-500">{made.get(entryOf(printCopy))?.toLocaleString() ?? printCopy.n} {VARIANT_LABELS[printCopy.variant]} made of this card.</p>
                <PrintDetail seasonId={season.id} copy={printCopy} label={printLabel} ret={listUrl} hrefFor={id => mk({ print: id, done: undefined, err: undefined })} />
              </>
            ) : <p className="text-sm text-gray-400">No print has that id in {season.name}.</p>}
          </aside>
        </>
      )}
    </div>
  );
}

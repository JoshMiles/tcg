import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { CardTile } from '@/app/components/CardTile';
import { getActive } from '@/lib/site-seasons';
import { getSeasonOverview } from '@/lib/site-data';
import { isTracking, mintedCounts, pageCopies } from '@/lib/serials';
import { ORIGIN_LABELS, isEscrow } from '@/lib/serials-core';
import { getHiddenUsers } from '@/lib/user-admin';
import { getRarity } from '@/lib/rarity';
import { profileHref } from '@/lib/profile-url';
import { VARIANTS, VARIANT_LABELS, encodeEntry } from '@/lib/variants';
import type { Variant } from '@/lib/types';

const SIZE = 25;

type SP = { season?: string; variant?: string; page?: string };

export async function generateMetadata({ params }: { params: Promise<{ card: string }> }): Promise<Metadata> {
  const { card } = await params;
  return { title: `Editions of card #${card}`, robots: { index: false, follow: true } };
}

/**
 * Every numbered copy of one card, one version at a time, newest first: who has it now, how and when it was made. Each row opens the
 * copy's own page with its full history. Collectors an admin hid or who made their profile private are shown as private.
 */
export default async function CardCopiesPage({ params, searchParams }: { params: Promise<{ card: string }>; searchParams: Promise<SP> }) {
  const number = Number((await params).card);
  const sp = await searchParams;
  if (!Number.isInteger(number) || number < 1 || number >= 1_000_000) notFound();
  const { season } = await getActive(sp.season);
  if (!season) notFound();
  const overview = await getSeasonOverview(season);
  const card = overview.cards.find(c => c.number === number);
  if (!card) notFound();

  const c = season.collectionName;
  const tracking = await isTracking(c);
  const made = tracking ? await mintedCounts(c) : new Map<number, number>();
  const upgradable = card.pack.upgradesEnabled && card.upgradesEnabled !== false;
  const versions = VARIANTS.filter(v => (made.get(encodeEntry(number, v)) ?? 0) > 0 && (upgradable || v === 'regular'));
  const variant: Variant = (versions as readonly string[]).includes(sp.variant ?? '') ? (sp.variant as Variant) : versions[0] ?? 'regular';
  const total = made.get(encodeEntry(number, variant)) ?? 0;
  const pages = Math.max(1, Math.ceil(total / SIZE));
  const pageNo = Math.min(pages - 1, Math.max(0, (Number(sp.page) || 1) - 1));
  const [{ copies }, hidden] = await Promise.all([pageCopies(c, number, variant, pageNo, SIZE), getHiddenUsers().catch(() => new Set<string>())]);

  const href = (o: { variant?: Variant; page?: number }) => {
    const q = new URLSearchParams({ season: season.id, variant: o.variant ?? variant });
    if (o.page && o.page > 1) q.set('page', String(o.page));
    return `/cards/${number}/copies?${q.toString()}`;
  };
  const who = (name?: string) => {
    if (!name) return null;
    if (isEscrow(name)) return <span className="text-gray-400">in a trade offer</span>;
    if (hidden.has(name)) return <span className="text-gray-400">a private collector</span>;
    return <Link href={profileHref(name)} className="relative z-10 text-yellow-300 hover:text-yellow-200 font-bold">@{name}</Link>;
  };
  const art = (variant === 'full' || variant === 'shiny') && card.fullArtImageUrl ? card.fullArtImageUrl : card.imageUrl;
  const rarity = getRarity(card.stars);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <nav className="text-sm text-gray-500"><Link href="/cards" className="hover:text-white">Card Dex</Link> <span className="mx-1">/</span> <Link href={`/cards?card=${number}`} className="hover:text-white">{card.name}</Link> <span className="mx-1">/</span> <span className="text-gray-300">All editions</span></nav>

      <header className="flex items-center gap-5">
        <CardTile imageUrl={art} alt={card.name} className="relative w-24 shrink-0 aspect-2/3 rounded-lg overflow-hidden border-2" style={{ borderColor: rarity?.hex }} />
        <div className="min-w-0">
          <p className="text-xs text-gray-500">#{number} · {card.packName} · {season.name}</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white leading-tight wrap-break-word">{card.name}: every edition</h1>
          <p className="text-sm text-gray-400 mt-1">{tracking ? `${total.toLocaleString()} ${VARIANT_LABELS[variant]} edition${total === 1 ? '' : 's'} made, newest first.` : 'Editions have not been numbered yet.'}</p>
        </div>
      </header>

      {!tracking || versions.length === 0 ? (
        <p className="rind rounded-2xl p-8 text-center text-gray-400">No numbered editions of this card exist yet.</p>
      ) : (
        <>
          <nav aria-label="Version" className="flex flex-wrap gap-1.5">
            {versions.map(v => (
              <Link key={v} href={href({ variant: v })} aria-current={v === variant ? 'true' : undefined}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${v === variant ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
                {VARIANT_LABELS[v]} · {(made.get(encodeEntry(number, v)) ?? 0).toLocaleString()}
              </Link>
            ))}
          </nav>

          <ul className="card rounded-2xl divide-y divide-gray-800/70 overflow-hidden">
            {copies.map(r => {
              const last = r.ev[r.ev.length - 1];
              const ended = last?.type === 'upgraded' ? 'spent in an upgrade' : last?.type === 'removed' ? 'removed from the game' : 'no longer exists';
              const pulledBy = r.origin === 'pull' ? r.ev[0]?.who : undefined;
              return (
                <li key={r.id} className="relative flex items-center gap-4 px-4 py-3 hover:bg-white/4">
                  {/* The number is the row's link (stretched over the whole row); the holder is its own link above it, so no link sits inside another. */}
                  <Link href={`/copy/${encodeURIComponent(season.id)}/${r.id}`} aria-label={`Edition #${r.n}`} className="font-display text-2xl font-bold text-yellow-400 tabular-nums w-16 shrink-0 after:absolute after:inset-0">#{r.n}{r.est ? '~' : ''}</Link>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-200 truncate">{r.owner ? who(r.owner) : <span className="text-gray-500">{ended}</span>}</p>
                    <p className="text-xs text-gray-500">
                      {ORIGIN_LABELS[r.origin]}{pulledBy && pulledBy !== r.owner ? <> · pulled by {hidden.has(pulledBy) ? 'a private collector' : `@${pulledBy}`}</> : null} · {new Date(r.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <Icon name="chevronRight" className="text-gray-600 shrink-0" />
                </li>
              );
            })}
          </ul>

          {pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Page {pageNo + 1} of {pages}</span>
              <span className="flex gap-2">
                {pageNo > 0 ? <Link href={href({ page: pageNo })} className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:text-white">← Newer</Link> : null}
                {pageNo + 1 < pages ? <Link href={href({ page: pageNo + 2 })} className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:text-white">Older →</Link> : null}
              </span>
            </div>
          )}
          <p className="text-xs text-gray-600">A &ldquo;~&rdquo; means the edition existed before editions were numbered and its order is an estimate.</p>
        </>
      )}
    </div>
  );
}

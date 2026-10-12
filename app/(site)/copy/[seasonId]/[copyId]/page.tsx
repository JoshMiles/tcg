import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { CardTile } from '@/app/components/CardTile';
import { ShareImageButton } from '@/app/components/ShareImage';
import { getPackCards, getPacksForSeason, getSeason } from '@/lib/kv';
import { getCopy, mintedCounts } from '@/lib/serials';
import { EVENT_LABELS, ORIGIN_LABELS, entryOf, isEscrow, parseCopyId } from '@/lib/serials-core';
import { getHiddenUsers } from '@/lib/user-admin';
import { getHoloResolver } from '@/lib/holo';
import { holoClass, holoVars } from '@/lib/holo-core';
import { getRarity } from '@/lib/rarity';
import { profileHref } from '@/lib/profile-url';
import { VARIANT_LABELS } from '@/lib/variants';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

async function load(seasonId: string, copyId: string) {
  const parsed = parseCopyId(copyId);
  const season = await getSeason(seasonId);
  if (!parsed || !season || season.status === 'draft') return null;
  const copy = await getCopy(season.collectionName, copyId);
  if (!copy) return null;
  const packs = await getPacksForSeason(season);
  for (const pack of packs) {
    const card = (await getPackCards(pack.id)).find(c => c.number === copy.card);
    if (card) return { season, copy, pack, card };
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ seasonId: string; copyId: string }> }): Promise<Metadata> {
  const { seasonId, copyId } = await params;
  const d = await load(decodeURIComponent(seasonId), copyId).catch(() => null);
  if (!d) return { title: 'Card copy', robots: { index: false } };
  const v = d.copy.variant === 'regular' ? '' : `${VARIANT_LABELS[d.copy.variant]} `;
  return { title: `${v}${d.card.name} #${d.copy.n}`, description: `Copy #${d.copy.n} of ${d.card.name}: who has held it and where it has been.`, robots: { index: false, follow: true } };
}

const when = (t: number) => new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export default async function CopyPage({ params }: { params: Promise<{ seasonId: string; copyId: string }> }) {
  const { seasonId, copyId } = await params;
  const d = await load(decodeURIComponent(seasonId), copyId);
  if (!d) notFound();
  const { season, copy, pack, card } = d;
  const [hidden, minted, holoFor] = await Promise.all([getHiddenUsers().catch(() => new Set<string>()), mintedCounts(season.collectionName), getHoloResolver()]);

  // Collectors who chose a private profile (or an admin hid) are not named here either.
  const who = (name?: string) => {
    if (!name) return null;
    if (isEscrow(name)) return <span className="text-gray-400">a trade offer</span>;
    if (hidden.has(name)) return <span className="text-gray-400">a private collector</span>;
    return <Link href={profileHref(name)} className="text-yellow-300 hover:text-yellow-200 font-bold">@{name}</Link>;
  };

  const total = minted.get(entryOf(copy)) ?? copy.n;
  const art = (copy.variant === 'full' || copy.variant === 'shiny') && card.fullArtImageUrl ? card.fullArtImageUrl : card.imageUrl;
  const rarity = getRarity(card.stars);
  const holo = holoFor(pack, card.stars)[copy.variant];
  const label = `${copy.variant === 'regular' ? '' : `${VARIANT_LABELS[copy.variant]} `}${card.name}`;
  const gone = !copy.owner;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <nav className="text-sm text-gray-500"><Link href="/cards" className="hover:text-white">Card Dex</Link> <span className="mx-1">/</span> <Link href={`/cards?card=${card.number}`} className="hover:text-white">{card.name}</Link></nav>

      <div className="grid md:grid-cols-[260px_1fr] gap-8 items-start">
        <div className="mx-auto w-full max-w-[260px]">
          <CardTile
            imageUrl={art}
            alt={label}
            className={`relative aspect-[2/3] rounded-xl overflow-hidden border-2 ${copy.variant !== 'regular' ? `vfx-${copy.variant}` : ''} ${holoClass(holo, true)}`}
            style={{ borderColor: rarity?.hex, boxShadow: `0 0 28px -6px ${rarity?.hex}`, ...holoVars(holo) }}
          />
        </div>

        <div className="space-y-5 min-w-0">
          <div>
            <p className="text-xs text-gray-500">#{card.number} · {pack.name} · {season.name}</p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-white leading-tight break-words">{label}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-display text-4xl font-bold text-yellow-400 tabular-nums">#{copy.n}</span>
              <span className="text-sm text-gray-400">of {total.toLocaleString()} {VARIANT_LABELS[copy.variant]} {card.name} made</span>
              {copy.est && <span title="This copy existed before serials. Numbers within a version were assigned afterwards, so the order is an estimate." className="text-[10px] font-extrabold uppercase tracking-wider rounded-full px-2 py-0.5 border border-amber-400/40 text-amber-300 bg-amber-500/10">estimated number</span>}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-gray-950/60 border border-gray-800 p-3"><dt className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">{gone ? 'Status' : 'Held by'}</dt><dd className="mt-0.5 text-gray-200">{gone ? 'No longer exists' : who(copy.owner)}</dd></div>
            <div className="rounded-xl bg-gray-950/60 border border-gray-800 p-3"><dt className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Created</dt><dd className="mt-0.5 text-gray-200">{when(copy.at)}</dd><dd className="text-xs text-gray-500">{ORIGIN_LABELS[copy.origin]}</dd></div>
          </dl>

          {copy.madeFrom && copy.madeFrom.length > 0 && (
            <p className="text-sm text-gray-400">Made by spending {copy.madeFrom.map((id, i) => (
              <span key={id}>{i > 0 && ', '}<Link href={`/copy/${encodeURIComponent(season.id)}/${id}`} className="text-yellow-300 hover:text-yellow-200 tabular-nums">#{id.split('.')[2]}</Link></span>
            ))}.</p>
          )}

          <div className="flex flex-wrap gap-2">
            <ShareImageButton
              spec={{ title: label, subtitle: `Copy #${copy.n} of ${total.toLocaleString()}`, stats: [season.name], cards: [{ src: art, name: card.name, hex: rarity?.hex, tag: `#${copy.n}` }], footer: SITE_URL.replace(/^https?:\/\//, '') }}
              filename={`cheesy-tcg-${card.number}-${copy.variant}-${copy.n}.png`}
              label="Share this card"
            />
          </div>
        </div>
      </div>

      <section className="tcg-panel rounded-2xl p-5">
        <h2 className="font-display text-xl font-bold text-white mb-3"><Icon name="history" className="mr-2 text-yellow-400" />History</h2>
        <ol className="space-y-3 border-l border-gray-800 pl-5">
          {copy.ev.map((e, i) => (
            <li key={i} className="relative text-sm">
              <span className="absolute -left-[26px] top-1.5 h-2 w-2 rounded-full bg-yellow-400" />
              <p className="text-gray-200">
                {e.type === 'minted' && <>Created{e.who ? <> for {who(e.who)}</> : null}</>}
                {e.type === 'traded' && <>Traded from {who(e.who)} to {who(e.to)}</>}
                {e.type === 'escrowed' && <>Put up in a trade offer by {who(e.who)}</>}
                {e.type === 'returned' && <>Came back to {who(e.who)} from a trade offer</>}
                {e.type === 'upgraded' && <>Spent by {who(e.who)} in an upgrade{e.note ? <> into <Link href={`/copy/${encodeURIComponent(season.id)}/${e.note}`} className="text-yellow-300 hover:text-yellow-200">a better copy</Link></> : null}</>}
                {e.type === 'removed' && <>Removed from {who(e.who)}&rsquo;s collection</>}
                {!['minted', 'traded', 'escrowed', 'returned', 'upgraded', 'removed'].includes(e.type) && EVENT_LABELS[e.type]}
              </p>
              <p className="text-xs text-gray-500">{when(e.t)}</p>
            </li>
          ))}
        </ol>
        {copy.ev.length >= 40 && <p className="mt-3 text-xs text-gray-600">Only the most recent events are kept.</p>}
      </section>
    </div>
  );
}

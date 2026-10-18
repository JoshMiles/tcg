import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { CardTile } from '@/app/components/CardTile';
import { FlipCard } from '@/app/components/FlipCard';
import { cardBackFor } from '@/lib/card-back-store';
import { ProvenanceTimeline } from '@/app/components/ProvenanceTimeline';
import { buildProvenance } from '@/lib/provenance';
import { editionLine, engravedDate, flipBackFor, histText } from '@/lib/flip-back';
import { copyShareSpec } from '@/lib/copy-share';
import { PinCopyButton } from '@/app/components/PinCopyButton';
import { FavouriteCopyButton } from '@/app/components/FavouriteCopyButton';
import { getSession } from '@/lib/session';
import { getUserSettings } from '@/lib/user-settings-store';
import { ShareStudio } from '@/app/components/ShareStudio';
import { getPackCards, getPacksForSeason, getSeason } from '@/lib/kv';
import { getCopy, mintedCounts } from '@/lib/serials';
import { ORIGIN_LABELS, ORIGIN_VERB, entryOf, isEscrow, parseCopyId } from '@/lib/serials-core';
import { getHiddenUsers } from '@/lib/user-admin';
import { copyPoints, getSeasonLeaderboardCached } from '@/lib/leaderboard';
import { serialMultiplier } from '@/lib/scoring-core';
import { SerialChip } from '@/app/components/SerialChip';
import { getHoloResolver } from '@/lib/holo';
import { holoClass, holoVars } from '@/lib/holo-core';
import { getRarity } from '@/lib/rarity';
import { profileHref } from '@/lib/profile-url';
import { VARIANT_LABELS } from '@/lib/variants';
import { InfoTip } from '@/app/components/InfoTip';
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
  if (!d) return { title: 'Card print', robots: { index: false } };
  const v = d.copy.variant === 'regular' ? '' : `${VARIANT_LABELS[d.copy.variant]} `;
  return { title: `${v}${d.card.name} ${d.copy.uid ? `#${d.copy.uid}` : `#${d.copy.n}`}`, description: `Edition #${d.copy.n} of ${d.card.name}: who has held it and where it has been.`, robots: { index: false, follow: true } };
}

const when = (t: number) => new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export default async function CopyPage({ params }: { params: Promise<{ seasonId: string; copyId: string }> }) {
  const { seasonId, copyId } = await params;
  const d = await load(decodeURIComponent(seasonId), copyId);
  if (!d) notFound();
  const { season, copy, pack, card } = d;
  const session = await getSession();
  // The holder can pin this copy to their profile.
  const canPin = !!session && !!copy.uid && copy.owner === session.username;
  const mySettings = canPin ? await getUserSettings(session!.username) : null;
  const pinned = mySettings?.pinned === copy.uid;
  const favourite = !!copy.uid && !!mySettings?.favourites.includes(copy.uid);
  const [hidden, minted, holoFor, board, backStyle] = await Promise.all([getHiddenUsers().catch(() => new Set<string>()), mintedCounts(season.collectionName), getHoloResolver(), getSeasonLeaderboardCached(season).catch(() => null), cardBackFor(pack, season.name)]);
  // What this very copy is worth: its card's points times the bonus its number earns.
  const cv = board?.values.cards.get(copy.card);
  const mult = board ? serialMultiplier(copy.n, board.values.settings) : 1;
  const worth = cv && board ? copyPoints(cv, copy.variant, copy.n, board.values.settings) : null;

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
  // The journey, and the names of the copies this one was forged from or into.
  const prov = buildProvenance(copy);
  const refIds = [...new Set([...(copy.madeFrom ?? []), ...copy.ev.filter(e => e.type === 'upgraded' && e.note).map(e => e.note as string)])].slice(0, 12);
  const refs: Record<string, { uid?: number; n: number }> = {};
  for (const id of refIds) {
    const c = await getCopy(season.collectionName, id).catch(() => null);
    if (c) refs[id] = { uid: c.uid, n: c.n };
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <nav className="text-sm text-gray-500"><Link href="/cards" className="hover:text-white">Card Dex</Link> <span className="mx-1">/</span> <Link href={`/cards?card=${card.number}`} className="hover:text-white">{card.name}</Link></nav>

      <div className="grid md:grid-cols-[260px_1fr] gap-8 items-start">
        <div className="mx-auto w-full max-w-[260px]">
          <FlipCard
            back={flipBackFor({
              n: copy.n, uid: copy.uid, total, variant: copy.variant, name: card.name, at: copy.at, est: copy.est,
              bonus: mult > 1 ? Math.round(mult * 100) / 100 : undefined, hex: rarity?.hex, origin: ORIGIN_LABELS[copy.origin],
              holder: gone ? null : copy.owner && isEscrow(copy.owner) ? 'a trade offer' : hidden.has(copy.owner) ? 'a private collector' : `@${copy.owner}`,
              history: copy.ev.slice(-3).map(e => ({ text: histText(e, hidden, copy.origin), date: engravedDate(e.t) })),
              qrUrl: `${SITE_URL}/copy/${encodeURIComponent(season.id)}/${copy.id}`,
            }, backStyle)}
          >
            <CardTile
              imageUrl={art}
              alt={label}
              className={`relative aspect-2/3 rounded-xl overflow-hidden border-2 ${copy.variant !== 'regular' ? `vfx-${copy.variant}` : ''} ${holoClass(holo, true)}`}
              style={{ borderColor: rarity?.hex, boxShadow: `0 0 28px -6px ${rarity?.hex}`, ...holoVars(holo) }}
            />
          </FlipCard>
        </div>

        <div className="space-y-5 min-w-0">
          <div>
            <p className="text-xs text-gray-500">#{card.number} · {pack.name} · {season.name}</p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-white leading-tight wrap-break-word">{label}</h1>
            {copy.uid && (
              <p className="mt-2 flex flex-wrap items-baseline gap-2">
                <span className="font-display text-xl font-bold text-yellow-400 tabular-nums leading-none">#{copy.uid}</span>
                <span className="text-xs uppercase tracking-wider text-gray-500 font-bold">Print number<InfoTip term="printNumber" /></span>
              </p>
            )}
            <p className="mt-2 flex flex-wrap items-center gap-2">
              {copy.uid
                ? <span className="text-sm text-gray-300">Edition<InfoTip term="edition" /> <strong className="text-white tabular-nums">#{copy.n}</strong> of {total.toLocaleString()} {VARIANT_LABELS[copy.variant]} {card.name} made</span>
                : <><span className="font-display text-3xl font-bold text-yellow-400 tabular-nums leading-none">#{copy.n}</span>
                  <span className="text-sm text-gray-400">of {total.toLocaleString()} {VARIANT_LABELS[copy.variant]} {card.name} made</span></>}
              {copy.est && <span title="This print existed before editions were numbered. Edition numbers within a version were assigned afterwards, so the order is an estimate." className="text-[10px] font-extrabold uppercase tracking-wider rounded-full px-2 py-0.5 border border-amber-400/40 text-amber-300 bg-amber-500/10">estimated number</span>}
            </p>
          </div>

          {worth !== null && !gone && (
            <div className={`rounded-xl border p-3 flex flex-wrap items-center gap-x-4 gap-y-1 ${mult > 1 ? 'border-yellow-500/50 bg-yellow-500/[0.07]' : 'border-gray-800 bg-gray-950/60'}`}>
              <SerialChip n={copy.n} bonus={mult > 1 ? Math.round(mult * 100) / 100 : undefined} est={copy.est} className="text-sm px-3! py-1!" />
              <span className="text-sm text-gray-200">Worth <strong className="text-white tabular-nums">{worth.toLocaleString()} pts</strong>{cv && worth !== cv.values[copy.variant] ? <span className="text-gray-500"> instead of {cv.values[copy.variant].toLocaleString()}</span> : null}</span>
              <span className="text-xs text-gray-500">{mult > 1 ? `Its edition number earns a ×${Math.round(mult * 100) / 100} points bonus: the first prints ever made of a card are worth extra.` : 'No bonus: only the first prints ever made of a card earn one.'}</span>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-gray-950/60 border border-gray-800 p-3"><dt className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">{gone ? 'Status' : 'Held by'}</dt><dd className="mt-0.5 text-gray-200">{gone ? 'No longer exists' : who(copy.owner)}</dd></div>
            <div className="rounded-xl bg-gray-950/60 border border-gray-800 p-3"><dt className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">{ORIGIN_VERB[copy.origin]}</dt><dd className="mt-0.5 text-gray-200">{when(copy.at)}</dd><dd className="text-xs text-gray-500">{ORIGIN_LABELS[copy.origin]}</dd></div>
          </dl>

          <div className="flex flex-wrap gap-2">
            {canPin && <PinCopyButton uid={copy.uid!} pinned={pinned} />}
            {canPin && <FavouriteCopyButton uid={copy.uid!} favourite={favourite} />}
          </div>
          <details className="group rounded-xl border border-gray-800 bg-gray-950/50 open:p-4 p-0">
            <summary className="cursor-pointer list-none px-4 py-2.5 group-open:px-0 group-open:pt-0 group-open:pb-4 text-sm font-bold text-yellow-300 hover:text-yellow-200 inline-flex items-center gap-1.5 w-full">
              <Icon name="share" />Share this print <span className="text-xs font-normal text-gray-500">pick a theme and shape</span>
            </summary>
            <ShareStudio
              base={copyShareSpec({
                copy, cardName: card.name, seasonId: season.id, seasonName: season.name, packName: pack.name, total, mult, art, hex: rarity?.hex,
                privateHolder: !!copy.owner && hidden.has(copy.owner), siteUrl: SITE_URL, back: backStyle,
              })}
              link={`${SITE_URL}/copy/${encodeURIComponent(season.id)}/${copy.id}`}
              shareText={`${label}${copy.uid ? ` #${copy.uid}` : ''} on The Cheesy TCG`}
              filename={`cheesy-tcg-${card.number}-${copy.variant}-${copy.n}.png`}
            />
          </details>
        </div>
      </div>

      <section className="tcg-panel rounded-2xl p-5">
        <h2 className="font-display text-xl font-bold text-white mb-4"><Icon name="history" className="mr-2 text-yellow-400" />Journey</h2>
        <ProvenanceTimeline
          prov={prov}
          who={name => who(name) ?? <span className="text-gray-400">somewhere</span>}
          plain={name => (hidden.has(name) ? 'a private collector' : `@${name}`)}
          seasonId={season.id}
          refs={refs}
          madeFrom={copy.madeFrom}
          origin={copy.origin}
        />
        {copy.ev.length >= 40 && <p className="mt-4 text-xs text-gray-600">Only the first event and the most recent ones are kept, so the middle of a very busy print&rsquo;s journey is not shown.</p>}
      </section>
    </div>
  );
}

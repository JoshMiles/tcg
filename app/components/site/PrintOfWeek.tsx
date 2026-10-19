import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { CardTile } from '@/app/components/CardTile';
import { FlipCard } from '@/app/components/FlipCard';
import { cardBackFor } from '@/lib/card-back-store';
import { loadFeatured } from '@/lib/print-of-week-store';
import { getHiddenUsers } from '@/lib/user-admin';
import { getHoloResolver } from '@/lib/holo';
import { holoClass, holoVars } from '@/lib/holo-core';
import { getRarity } from '@/lib/rarity';
import { mintedCounts } from '@/lib/serials';
import { ORIGIN_LABELS, entryOf, isEscrow } from '@/lib/serials-core';
import { editionLine, flipBackFor } from '@/lib/flip-back';
import { serialMultiplier } from '@/lib/scoring-core';
import type { ScoringSettings } from '@/lib/scoring-core';
import { profileHref } from '@/lib/profile-url';
import { VARIANT_LABELS, usesFullArt } from '@/lib/variants';
import { SITE_URL } from '@/lib/site';

/** The home page's "Card of the week". Shows nothing when there is no pick or the edition was spent since. Holders are masked like the edition page. */
export async function PrintOfWeek({ settings }: { settings?: ScoringSettings }) {
  const f = await loadFeatured().catch(() => null);
  if (!f) return null;
  const { pick, season, copy, card, pack } = f;
  const [hidden, minted, holoFor, backStyle] = await Promise.all([getHiddenUsers().catch(() => new Set<string>()), mintedCounts(season.collectionName).catch(() => new Map<number, number>()), getHoloResolver(), cardBackFor(pack, season.name)]);
  const total = minted.get(entryOf(copy)) ?? copy.n;
  const mult = settings ? serialMultiplier(copy.n, settings) : 1;
  const rarity = getRarity(card.stars);
  const holo = holoFor(pack, card.stars)[copy.variant];
  const art = usesFullArt(copy.variant) && card.fullArtImageUrl ? card.fullArtImageUrl : card.imageUrl;
  const label = `${copy.variant === 'regular' ? '' : `${VARIANT_LABELS[copy.variant]} `}${card.name}`;
  const inOffer = isEscrow(copy.owner);
  const holder = inOffer ? 'a trade offer' : hidden.has(copy.owner) ? 'a private collector' : `@${copy.owner}`;
  const href = `/copy/${encodeURIComponent(season.id)}/${copy.id}`;

  return (
    <section aria-label="Card of the week" className="rind rounded-2xl p-5 sm:p-8 grid gap-6 sm:grid-cols-[220px_1fr] items-center">
      <div className="mx-auto w-full max-w-[220px]">
        <FlipCard
          back={flipBackFor({
            n: copy.n, uid: copy.uid, total, variant: copy.variant, name: card.name, at: copy.at, est: copy.est,
            bonus: mult > 1 ? Math.round(mult * 100) / 100 : undefined, hex: rarity?.hex, origin: ORIGIN_LABELS[copy.origin], holder,
            qrUrl: `${SITE_URL}${href}`,
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
      <div className="space-y-3 min-w-0">
        <h2 className="font-display text-3xl font-bold text-white"><Icon name="sparkles" className="mr-2 text-yellow-400" />Card of the week</h2>
        <p className="font-display text-2xl font-bold text-white wrap-break-word">{label}</p>
        <p className="font-display text-xl font-bold text-yellow-400 tabular-nums">Edition #{pick.uid}</p>
        <p className="text-sm text-gray-300">{editionLine(copy.n, total)}</p>
        <p className="text-sm text-gray-400">
          {inOffer || hidden.has(copy.owner) ? <>Held by {holder}</> : <>Held by <Link href={profileHref(copy.owner)} className="text-yellow-300 hover:text-yellow-200 font-bold">@{copy.owner}</Link></>}
        </p>
        <Link href={href} className="btn btn-primary inline-flex items-center px-4 py-2 rounded-xl text-sm"><Icon name="history" className="mr-1.5" />See its journey</Link>
        <p className="text-xs text-gray-500">{pick.reason}.</p>
      </div>
    </section>
  );
}

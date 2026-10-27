import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { getUserProfile, getUserProfiles } from '@/lib/kv';
import { getCollectionCached } from '@/lib/leaderboard';
import { getHiddenUsers } from '@/lib/user-admin';
import { getUserSettings } from '@/lib/user-settings-store';
import { watchersByCard } from '@/lib/watch-index';
import { tradeBlockedNow } from '@/lib/restriction';
import { findSwaps } from '@/lib/swap-finder';
import { describeItems } from '@/lib/trade-core';
import { decodeEntry } from '@/lib/variants';
import type { Season } from '@/lib/types';

// "Possible swaps" on the board (ROADMAP 50.3 trial): holders of a card the viewer is looking for who want a spare the viewer has.
const SHOWN = 5;
const CHECKED = 20; // candidates whose profile and settings are read; the rest are never looked at

export async function SwapFinder({ season, me, owned, wanted, nameOf }: { season: Season; me: string; owned: number[]; wanted: number[]; nameOf: (n: number) => string | undefined }) {
  const counts = new Map<number, number>();
  for (const e of owned) counts.set(e, (counts.get(e) ?? 0) + 1);
  const spareCards = [...new Set([...counts].filter(([, n]) => n > 1).map(([e]) => decodeEntry(e).cardNumber))];

  let rows: { username: string; display: string; pairs: ReturnType<typeof findSwaps>[number]['pairs'] }[] = [];
  if (wanted.length > 0 && spareCards.length > 0 && !tradeBlockedNow((await getUserProfile(me).catch(() => null))?.flags)) {
    const [board, hidden, watchers] = await Promise.all([getCollectionCached(season), getHiddenUsers().catch(() => new Set<string>()), watchersByCard(spareCards)]);
    const found = findSwaps(owned, wanted, board, watchers, u => u === me || hidden.has(u)).slice(0, CHECKED);
    const profiles = await getUserProfiles(found.map(f => f.username)).catch(() => new Map());
    const prefs = await Promise.all(found.map(f => getUserSettings(f.username)));
    rows = found
      .map((f, i) => ({ f, p: profiles.get(f.username), s: prefs[i] }))
      .filter(({ p, s }) => !tradeBlockedNow(p?.flags) && !s.privateProfile && s.allowOffers)
      .slice(0, SHOWN)
      .map(({ f, p }) => ({ username: f.username, display: p?.displayName || f.username, pairs: f.pairs }));
  }

  const label = (entry: number) => { const { cardNumber, variant } = decodeEntry(entry); return describeItems([{ cardNumber, variant, count: 1 }], nameOf); };
  return (
    <section className="space-y-3" aria-label="Possible swaps">
      <h2 className="font-display text-xl font-bold text-white flex items-center gap-2"><Icon name="trade" className="mr-2 text-yellow-400" />Possible swaps</h2>
      {rows.length === 0 ? (
        <p className="rind rounded-2xl p-5 text-sm text-gray-400">
          No swaps to suggest yet. Add cards you want to your <Link href="/settings#looking-for" className="text-yellow-400 hover:text-yellow-300">Looking for list</Link>, and keep a spare edition of something other collectors want.
        </p>
      ) : (
        <>
          <p className="text-xs text-gray-500 -mt-1">Collectors who have a card you are looking for and want one of your spare editions.</p>
          <ul className="flex flex-col gap-2">
            {rows.map(r => {
              const best = r.pairs[0];
              const { cardNumber: wantCard, variant: wantVariant } = decodeEntry(best.have);
              const { cardNumber: giveCard, variant: giveVariant } = decodeEntry(best.give);
              const href = `/trade/new?to=${encodeURIComponent(r.username)}&season=${encodeURIComponent(season.id)}&give=${giveCard}.${giveVariant}.1&want=${wantCard}.${wantVariant}&via=swap`;
              return (
                <li key={r.username} className="rind rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-gray-300 min-w-0">
                    <strong className="text-white">{r.display}</strong> has <strong className="text-yellow-300">{label(best.have)}</strong>, wants your <strong className="text-yellow-300">{label(best.give)}</strong>
                    {!best.theirSpare && <span className="ml-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 border border-gray-600 rounded-full px-2 py-0.5 align-middle">Only copy</span>}
                    {r.pairs.length > 1 && <span className="ml-2 text-xs text-gray-500">+{r.pairs.length - 1} more</span>}
                  </p>
                  <Link href={href} className="btn btn-primary btn-sm rounded-xl">Offer this swap</Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

import type { Metadata } from 'next';
import { getActive, getSeasonOverview } from '@/lib/site-data';
import { collectionBonuses } from '@/lib/leaderboard';
import { DEFAULT_SCORING } from '@/lib/scoring';
import { DEFAULT_UPGRADE_COSTS, DEFAULT_VARIANT_WEIGHTS, VARIANTS, effectiveWeights } from '@/lib/variants';
import { getTradeSettings } from '@/lib/trades';
import { getCommands } from '@/lib/commands';
import { OpenOnHash } from '@/app/components/site/OpenOnHash';
import { StartSection } from './sections/start';
import { CardsSection } from './sections/cards';
import { UpgradesSection } from './sections/upgrades';
import { TradingSection } from './sections/trading';
import { ProfileSection } from './sections/profile';
import { CommandsSection } from './sections/commands';
import { ShowSection } from './sections/show';
import { PointsSection } from './sections/points';
import { SeasonsSection } from './sections/seasons';
import { ExtensionSection } from './sections/extension';
import { PrivacySection } from './sections/privacy';
import { HelpSection } from './sections/help';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'FAQ',
  description: 'How The Cheesy TCG works: packs, variants, upgrades, points and the leaderboard.',
};

const SECTIONS = [
  { id: 'start', label: 'Getting started' },
  { id: 'commands', label: 'Chat commands' },
  { id: 'cards', label: 'Cards & versions' },
  { id: 'trading', label: 'Trading' },
  { id: 'upgrades', label: 'Upgrading' },
  { id: 'profile', label: 'Your profile' },
  { id: 'show', label: 'Showing off' },
  { id: 'points', label: 'Points & leaderboard' },
  { id: 'seasons', label: 'Seasons' },
  { id: 'extension', label: 'Twitch extension' },
  { id: 'privacy', label: 'Privacy & data' },
  { id: 'help', label: 'Something not working?' },
];

export default async function FaqPage() {
  const { season } = await getActive();
  const overview = season ? await getSeasonOverview(season) : null;
  const trade = await getTradeSettings();
  const chatCommands = (await getCommands()).filter(c => c.enabled);

  // Live numbers from the current season where we have them; sensible defaults otherwise.
  const upgradePack = overview?.cards.find(c => c.pack.upgradesEnabled)?.pack ?? null;
  const costs = upgradePack?.upgradeCosts ?? DEFAULT_UPGRADE_COSTS;
  const weights = upgradePack ? effectiveWeights(upgradePack) : DEFAULT_VARIANT_WEIGHTS;
  const wTotal = VARIANTS.reduce((s, v) => s + Math.max(0, weights[v]), 0) || 1;
  const pct = (v: (typeof VARIANTS)[number]) => {
    const p = (Math.max(0, weights[v]) / wTotal) * 100;
    return p >= 10 ? p.toFixed(0) : p.toFixed(1);
  };
  const upgradesOn = !!upgradePack;

  // Live numbers for the collection bonuses.
  const bonusAtFull = overview ? collectionBonuses(overview.values, overview.values.totalCards) : null;
  const scoring = overview?.values.settings ?? DEFAULT_SCORING;

  const valueRows = overview
    ? overview.cards
        .map(c => ({ card: c, v: overview.values.cards.get(c.number), upgradable: c.pack.upgradesEnabled && c.upgradesEnabled !== false }))
        .filter(x => x.v)
        .sort((a, b) => b.v!.values.regular - a.v!.values.regular)
    : [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-10">
      <OpenOnHash />
      <header className="space-y-3">
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-white">Frequently asked questions</h1>
        <p className="text-gray-400 leading-relaxed max-w-2xl">
          Everything about collecting cards on The Cheesy TCG: how to get them, what the versions mean, how upgrades work and how your points are worked out.
        </p>
        <nav aria-label="FAQ sections" className="flex flex-wrap gap-2 pt-1">
          {SECTIONS.map(s => (
            <a key={s.id} href={`#${s.id}`} className="px-3 py-1 rounded-full text-xs font-semibold border border-gray-700 text-gray-300 hover:text-yellow-300 hover:border-yellow-500/50 transition-colors">
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      {/* ── Getting started ── */}
      <StartSection />

      {/* ── Chat commands ── */}
      <CommandsSection chatCommands={chatCommands} />

      {/* ── Cards & versions ── */}
      <CardsSection pct={pct} upgradesOn={upgradesOn} />

      {/* ── Trading ── */}
      <TradingSection trade={trade} />

      {/* ── Upgrading ── */}
      <UpgradesSection costs={costs} upgradesOn={upgradesOn} />

      {/* ── Your profile ── */}
      <ProfileSection />

      {/* ── Showing off ── */}
      <ShowSection />

      {/* ── Points & leaderboard ── */}
      <PointsSection season={season} overview={overview} upgradesOn={upgradesOn} bonusAtFull={bonusAtFull} scoring={scoring} valueRows={valueRows} />

      {/* ── Seasons ── */}
      <SeasonsSection />

      {/* ── Extension ── */}
      <ExtensionSection />

      {/* ── Privacy ── */}
      <PrivacySection />

      {/* ── Help ── */}
      <HelpSection />
    </div>
  );
}

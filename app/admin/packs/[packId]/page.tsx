import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { getPack, getPackCards, getPackRev, listAllPacks, listSeasons } from '@/lib/kv';
import { getPackOverrides } from '@/lib/overlay-settings';
import { getCardBack } from '@/lib/card-back-store';
import { heldCardNumbers } from '@/lib/card-held';
import { packHealth } from '@/lib/pack-health';
import { effectiveWeights } from '@/lib/variants';
import { workOf } from '@/lib/pack-editor-core';
import { getHoloResolver } from '@/lib/holo';
import { rarityStats } from '@/lib/rarity';
import { OddsPanel } from './OddsPanel';
import { PackVariantsPanel } from './VariantControls';
import { PackWorkspace, type WorkspaceView } from './workspace/PackWorkspace';

export const dynamic = 'force-dynamic';

// The tab names the pack, so several open packs can be told apart.
export async function generateMetadata({ params }: { params: Promise<{ packId: string }> }) {
  const pack = await getPack((await params).packId);
  return { title: `${pack?.name || 'Pack'} · Admin`, robots: { index: false } };
}

/** The pack workspace (ROADMAP 20.2a). Old addresses still work: ?tab=settings opens the pack settings, ?tab=odds and ?tab=overview their views. */
export default async function PackPage({ params, searchParams }: { params: Promise<{ packId: string }>; searchParams: Promise<{ tab?: string; view?: string; card?: string }> }) {
  const { packId } = await params;
  const { tab, view: viewParam, card } = await searchParams;
  if (tab) {
    const q = new URLSearchParams();
    if (tab === 'odds' || tab === 'overview') q.set('view', tab);
    if (tab === 'settings') q.set('card', 'pack');
    redirect(`/admin/packs/${packId}${q.size ? `?${q}` : ''}`);
  }
  const [pack, cards, seasons, overrides, cardBack, allPacks, rev, held, holoFor] = await Promise.all([
    getPack(packId), getPackCards(packId), listSeasons(), getPackOverrides().catch((): Record<string, unknown> => ({})), getCardBack(packId), listAllPacks(), getPackRev(packId),
    heldCardNumbers(packId).catch(() => new Set<number>()), getHoloResolver(),
  ]);
  if (!pack) notFound();
  const inSeasons = seasons.filter(s => s.packIds.includes(packId));
  const overrideCount = Object.keys((overrides[packId] ?? {}) as Record<string, unknown>).length;
  const sorted = [...cards].sort((a, b) => a.number - b.number);
  const isDraft = pack.status === 'draft';
  const health = isDraft || pack.archived ? [] : packHealth(pack, cards, { inSeason: inSeasons.length > 0 });
  const cardWeights = Object.fromEntries(cards.map(c => [c.id, effectiveWeights(pack, c)]));
  const rarityBreakdown = rarityStats(cards);
  const byId = new Map(allPacks.map(p => [p.id, p]));
  const seasonUse = inSeasons.map(s => {
    const drawn = s.packIds.map(id => byId.get(id)).filter(p => p && p.active && p.status === 'published') as typeof allPacks;
    const sum = drawn.reduce((t, p) => t + p.weight, 0);
    return { id: s.id, name: s.name, active: s.active, share: pack.active && !isDraft && sum > 0 ? pack.weight / sum : null };
  });
  const view: WorkspaceView = viewParam === 'grid' || viewParam === 'odds' || viewParam === 'overview' ? viewParam : 'edit';
  const state = { work: workOf(pack, cards), rev, held: [...held], status: pack.status, archived: !!pack.archived };

  const oddsView = sorted.length > 0
    ? <OddsPanel packId={packId} cards={sorted.map(c => ({ id: c.id, number: c.number, name: c.name, stars: c.stars, imageUrl: c.imageUrl, probability: c.probability }))} upgrades={pack.upgradesEnabled} cardWeights={cardWeights} />
    : <p className="tcg-panel rounded-2xl px-5 py-12 text-center text-gray-500">Add some cards first, then tune their odds here.</p>;

  const overviewView = (
      <div className="grid xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
        {/* Health */}
        {!isDraft && !pack.archived && (
          <div id="health" className="tcg-panel rounded-2xl p-5 space-y-3 scroll-mt-20">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              {health.length === 0 ? <Icon name="checkCircle" className="text-emerald-400" /> : <Icon name="warning" className="text-amber-400" />}Pack health
            </h3>
            {health.length === 0 ? <p className="text-sm text-gray-500">Nothing to fix: cards, odds and art all look complete.</p> : (
              <ul className="space-y-2">
                {health.map(h => (
                  <li key={h.id} className="flex items-start gap-2.5 text-sm">
                    <Icon name={h.level === 'warn' ? 'warning' : 'info'} className={`w-4 h-4 mt-0.5 shrink-0 ${h.level === 'warn' ? 'text-amber-400' : 'text-sky-300'}`} />
                    <span className="flex-1 text-gray-300 leading-snug">{h.text}</span>
                    {h.href && <Link href={h.href} className="shrink-0 text-xs font-semibold text-yellow-400 hover:text-yellow-300">Fix →</Link>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Where it's used */}
        <div className="tcg-panel rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">Used in</h3>
          {inSeasons.length > 0 ? (
            <ul className="space-y-1.5">
              {inSeasons.map(s => (
                <li key={s.id}>
                  <Link href={`/admin/seasons/${s.id}`} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-white/[0.03] hover:bg-white/[0.07] text-sm text-gray-200 transition-colors">
                    <span className="truncate">{s.name}</span>
                    {s.active && <span className="text-[10px] font-extrabold uppercase tracking-wider text-yellow-300">Active season</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-amber-300">
              {isDraft ? 'Not in a season yet.' : 'Not in any season, so this pack is never drawn.'}{' '}
              <Link href="/admin/seasons" className="underline hover:text-amber-100">Add it to a season →</Link>
            </p>
          )}
        </div>

        </div>
        <div className="space-y-6">
        <PackVariantsPanel packId={packId} upgradesEnabled={pack.upgradesEnabled} disabled={pack.disabledVariants ?? []} weights={pack.variantWeights} />

        {/* Rarity breakdown */}
        {rarityBreakdown.length > 0 && (
          <div className="tcg-panel rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Rarity Mix</h3>
            {rarityBreakdown.map(r => (
              <div key={r.stars} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className={r.text}>{'★'.repeat(r.stars)} {r.label}</span>
                  <span className="text-gray-600">{r.count} cards · {r.pct}%</span>
                </div>
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full ${r.bar} rounded-full`} style={{ width: `${r.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        </div>
      </div>
  );

  return (
    <PackWorkspace
      packId={packId}
      initial={state}
      seasons={seasonUse}
      overrideCount={overrideCount}
      cardBack={{
        packId, packName: pack.name, seasonName: inSeasons[0]?.name, coverImageUrl: pack.coverImageUrl, initial: cardBack,
        others: allPacks.filter(p => p.id !== packId && p.status !== 'draft').map(p => ({ id: p.id, name: p.name })),
        sampleFallback: { name: 'Sample card', imageUrl: pack.coverImageUrl },
      }}
      odds={oddsView}
      overview={overviewView}
      initialView={view}
      initialSelection={card ?? null}
      healthCount={health.length}
      holoByStars={Object.fromEntries([1, 2, 3, 4, 5].map(s => [s, holoFor(pack, s)]))}
      onStream={pack.status === 'published' && pack.active && inSeasons.some(s => s.active)}
    />
  );
}

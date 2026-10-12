import { Icon } from '@/app/components/Icon';
import { PendingButton } from '../components/PendingButton';
import Link from 'next/link';
import { listAllPacks, getPackCards, listSeasons } from '@/lib/kv';
import { getPackOverrides } from '@/lib/overlay-settings';
import { rarityStats } from '@/lib/rarity';
import { deletePackAction, setPackActive } from '../actions';
import { archivePackAction, duplicatePackAction, restorePackAction } from '../pack-actions';
import { packHealth } from '@/lib/pack-health';
import { getPackPulls } from '@/lib/stats';
import { discardDraftPack } from '../draft-actions';
import { NewPackButton } from '../components/NewPackButton';
import { ConfirmButton } from '../components/ConfirmButton';
import { BrandMark } from '../components/BrandMark';
import { StatusChip, DraftChip } from '../components/StatusChip';
import { PackToolbar } from './PackToolbar';
import { PageHeader, EmptyState } from '../components/ui';

export const dynamic = 'force-dynamic';

type Status = 'live' | 'inactive' | 'draft' | 'archived';

export default async function PacksPage() {
  const [packs, seasons, overrides] = await Promise.all([listAllPacks(), listSeasons(), getPackOverrides().catch((): Record<string, unknown> => ({}))]);
  // Drafts first (they're unfinished work), then newest first. `data-order` keeps this as the default sort.
  packs.sort((a, b) => Number(b.status === 'draft') - Number(a.status === 'draft') || b.createdAt - a.createdAt);

  const stats = await Promise.all(
    packs.map(async p => {
      const cards = await getPackCards(p.id);
      return { id: p.id, count: cards.length, tiers: rarityStats(cards), cards };
    })
  );
  const statsMap = Object.fromEntries(stats.map(s => [s.id, s]));
  const statusOf = (p: (typeof packs)[number]): Status => (p.archived ? 'archived' : p.status === 'draft' ? 'draft' : p.active ? 'live' : 'inactive');
  // Draws per pack since tracking began (see lib/stats.ts), over every season that uses it.
  const pulls = await getPackPulls([...new Set(seasons.map(s => s.collectionName))]);
  const totalPulls = Object.values(pulls).reduce((n, v) => n + v, 0);

  const counts = {
    all: packs.filter(p => !p.archived).length,
    archived: packs.filter(p => p.archived).length,
    live: packs.filter(p => statusOf(p) === 'live').length,
    inactive: packs.filter(p => statusOf(p) === 'inactive').length,
    draft: packs.filter(p => statusOf(p) === 'draft').length,
  };
  const totalCards = stats.reduce((n, s, i) => n + (packs[i].archived ? 0 : s.count), 0);
  // A published pack that no season uses is never drawn: worth flagging.
  const orphaned = packs.filter(p => p.status !== 'draft' && !p.archived && !seasons.some(s => s.packIds.includes(p.id)));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Packs"
        subtitle={`${counts.all} pack${counts.all !== 1 ? 's' : ''} · ${totalCards} cards${counts.draft > 0 ? ` · ${counts.draft} draft${counts.draft !== 1 ? 's' : ''}` : ''} · packs are shared: add them to any season`}
        actions={<NewPackButton />}
      />

      {orphaned.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
          <strong>{orphaned.map(p => p.name || 'Untitled pack').join(', ')}</strong>{' '}
          {orphaned.length === 1 ? 'is' : 'are'} published but not in any season, so {orphaned.length === 1 ? 'it' : 'they'} can&apos;t be drawn.{' '}
          <Link href="/admin/seasons" className="underline hover:text-amber-100">Add to a season →</Link>
        </div>
      )}

      {packs.length === 0 ? (
        <EmptyState icon="cards" title="No packs yet" action={<NewPackButton />}>
          A pack is a set of cards viewers can pull. Create one, then add it to a season to start drawing it on stream.
        </EmptyState>
      ) : (
        <>
          <PackToolbar counts={counts} />

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            {packs.map((pack, index) => {
              const { count, tiers, cards: packCards } = statsMap[pack.id] ?? { count: 0, tiers: [], cards: [] };
              const status = statusOf(pack);
              const isDraft = status === 'draft';
              const isArchived = status === 'archived';
              const del = isDraft ? discardDraftPack.bind(null, pack.id) : deletePackAction.bind(null, pack.id);
              const inSeasons = seasons.filter(s => s.packIds.includes(pack.id));
              const hasOverrides = Object.keys(overrides[pack.id] ?? {}).length > 0;
              const health = isDraft || isArchived ? [] : packHealth(pack, packCards, { inSeason: inSeasons.length > 0 });
              const drawn = pulls[pack.name] ?? 0;
              return (
                // Gradient rim = the card border. Active packs get the gold frame.
                <div
                  key={pack.id}
                  data-pack
                  data-status={status}
                  data-order={index}
                  data-name={(pack.name || 'untitled pack').toLowerCase()}
                  data-cards={count}
                  data-weight={pack.weight}
                  data-search={`${pack.name} ${inSeasons.map(s => s.name).join(' ')}`.toLowerCase()}
                  className={`rounded-[1.6rem] p-[3px] transition-all hover:-translate-y-1 ${
                    isArchived
                      ? 'bg-gradient-to-br from-gray-700/60 to-gray-900 opacity-80'
                      : isDraft
                      ? 'bg-gradient-to-br from-amber-700/60 to-gray-800'
                      : pack.active
                      ? 'bg-gradient-to-br from-yellow-300 via-yellow-500 to-amber-600 shadow-glow'
                      : 'bg-gradient-to-br from-gray-600 to-gray-800'
                  }`}
                >
                  <div className="rounded-[1.4rem] bg-gray-900 overflow-hidden flex flex-col h-full">
                    <Link
                      href={isDraft ? `/admin/packs/new?draft=${pack.id}` : `/admin/packs/${pack.id}`}
                      aria-label={`${isDraft ? 'Continue setting up' : 'Manage'} ${pack.name || 'Untitled pack'}`}
                      className="p-3 pb-0 block"
                    >
                      <div className="holo-hover relative aspect-[4/3] rounded-xl overflow-hidden bg-gray-950 border border-white/10 flex items-center justify-center">
                        {pack.coverImageUrl ? (
                          <img src={pack.coverImageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                        ) : (
                          <BrandMark size={64} />
                        )}
                        <span className="absolute top-2 right-2 font-display text-xs font-bold bg-gray-950/80 text-yellow-300 border border-yellow-500/40 rounded-full px-2.5 py-1">
                          {count} cards
                        </span>
                        {pack.upgradesEnabled && (
                          <span className="absolute top-2 left-2 text-[11px] font-extrabold uppercase tracking-wider bg-gray-950/80 text-purple-300 border border-purple-400/40 rounded-full px-2 py-1" title="Variants and upgrades are on for this pack">
                            <Icon name="sparkles" className="mr-1" />Upgrades{(pack.disabledVariants?.length ?? 0) > 0 ? ` · ${pack.disabledVariants!.length} off` : ''}
                          </span>
                        )}
                      </div>
                    </Link>

                    <div className="p-4 space-y-3 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="font-display text-xl font-bold text-white leading-tight">{pack.name || 'Untitled pack'}</h2>
                        {isArchived ? (
                          <span className="text-[11px] font-extrabold uppercase tracking-wider rounded-full border border-gray-600 text-gray-400 px-2.5 py-1">Archived</span>
                        ) : isDraft ? (
                          <DraftChip />
                        ) : (
                          // The chip is the switch: click to turn the pack on or off.
                          <form action={setPackActive.bind(null, pack.id, !pack.active)}>
                            <PendingButton
                              type="submit"
                              title={pack.active ? 'Active: click to deactivate' : 'Inactive: click to activate'}
                              className="rounded-full hover:brightness-125 transition"
                            >
                              <StatusChip active={pack.active} />
                            </PendingButton>
                          </form>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5 min-h-[1.75rem]">
                        {tiers.filter(t => t.pct > 0).map(t => (
                          <span key={t.stars} className={`text-xs font-bold bg-white/5 rounded-md px-2 py-1 ${t.text}`}>
                            {'★'.repeat(t.stars)} <span className="text-gray-400 font-semibold">{t.pct}%</span>
                          </span>
                        ))}
                        {count === 0 && <span className="text-xs text-gray-600">No cards yet</span>}
                      </div>

                      {/* Where is it used? */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {inSeasons.length > 0 ? (
                          inSeasons.map(s => (
                            <Link
                              key={s.id}
                              href={`/admin/seasons/${s.id}`}
                              className={`rounded-md px-2 py-1 font-semibold border transition-colors ${
                                s.active ? 'text-yellow-300 border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20' : 'text-gray-400 border-gray-700 hover:text-white hover:border-gray-500'
                              }`}
                              title={s.active ? 'The active season' : 'Season'}
                            >
                              {s.active ? '● ' : ''}{s.name}
                            </Link>
                          ))
                        ) : isDraft ? (
                          <span className="text-gray-600">Not in a season yet</span>
                        ) : (
                          <span className="text-amber-400 font-semibold">Not in any season: never drawn</span>
                        )}
                      </div>

                      {/* Health and usage */}
                      {!isDraft && !isArchived && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          {health.length === 0 ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-400"><Icon name="checkCircle" className="w-3.5 h-3.5" />Healthy</span>
                          ) : (
                            <Link href={`/admin/packs/${pack.id}?tab=overview#health`} title={health.map(h => h.text).join('\n')} className={`inline-flex items-center gap-1 font-semibold hover:underline ${health.some(h => h.level === 'warn') ? 'text-amber-300' : 'text-sky-300'}`}>
                              <Icon name={health.some(h => h.level === 'warn') ? 'warning' : 'info'} className="w-3.5 h-3.5" />{health.length} issue{health.length === 1 ? '' : 's'}
                            </Link>
                          )}
                          {totalPulls > 0 && <span className="text-gray-500" title="Pulls drawn from this pack since tracking began">{drawn.toLocaleString()} pulls · {Math.round((drawn / totalPulls) * 100)}% of draws</span>}
                        </div>
                      )}

                      <p className="text-xs text-gray-500 font-semibold">
                        Draw weight {pack.weight}×
                        {!isDraft && (
                          <>
                            {' · '}
                            <Link href={`/admin/overlay?scope=${pack.id}`} className="text-gray-400 hover:text-yellow-300 underline decoration-dotted">
                              Overlay look{hasOverrides ? ' ●' : ''}
                            </Link>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="px-4 pb-4 flex items-center gap-2">
                      <Link
                        href={isDraft ? `/admin/packs/new?draft=${pack.id}` : `/admin/packs/${pack.id}`}
                        className="tcg-btn flex-1 text-center px-3 py-2 text-sm rounded-xl"
                      >
                        {isDraft ? 'Continue setup →' : 'Manage →'}
                      </Link>
                      <form action={duplicatePackAction.bind(null, pack.id)}>
                        <PendingButton type="submit" title="Duplicate as a draft" aria-label={`Duplicate ${pack.name || 'pack'}`} className="w-9 h-9 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><Icon name="copy" /></PendingButton>
                      </form>
                      {!isDraft && (
                        <form action={(isArchived ? restorePackAction : archivePackAction).bind(null, pack.id)}>
                          <PendingButton type="submit" title={isArchived ? 'Restore from the archive' : 'Archive: hide and stop drawing it'} aria-label={isArchived ? 'Restore pack' : 'Archive pack'} className="w-9 h-9 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><Icon name={isArchived ? 'undo' : 'inbox'} /></PendingButton>
                        </form>
                      )}
                      <form action={del}>
                        <ConfirmButton
                          title={isDraft ? 'Discard draft?' : 'Delete pack?'}
                          confirmLabel={isDraft ? 'Discard draft' : 'Delete pack'}
                          message={<>{isDraft ? 'Discard' : 'Delete'} <strong className="text-white">{pack.name || 'Untitled pack'}</strong>? Its cards are deleted{isDraft ? '' : ' and it is removed from every season'}. This can&apos;t be undone.</>}
                          className="px-3 py-2 text-xs font-bold text-red-400 hover:text-red-200 hover:bg-red-950/50 rounded-xl transition-colors"
                        >
                          {isDraft ? 'Discard' : 'Delete'}
                        </ConfirmButton>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

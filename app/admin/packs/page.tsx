import Link from 'next/link';
import { listAllPacks, getPackCards } from '@/lib/kv';
import { rarityStats } from '@/lib/rarity';
import { deletePackAction } from '../actions';
import { discardDraftPack } from '../draft-actions';
import { NewPackButton } from '../components/NewPackButton';
import { ConfirmButton } from '../components/ConfirmButton';
import { BrandMark } from '../components/BrandMark';
import { StatusChip, DraftChip } from '../components/StatusChip';

export const dynamic = 'force-dynamic';

export default async function PacksPage() {
  const packs = await listAllPacks();
  // Drafts first (they're unfinished work), then newest first.
  packs.sort((a, b) => Number(b.status === 'draft') - Number(a.status === 'draft') || b.createdAt - a.createdAt);
  const draftCount = packs.filter(p => p.status === 'draft').length;

  const stats = await Promise.all(
    packs.map(async p => {
      const cards = await getPackCards(p.id);
      return { id: p.id, count: cards.length, tiers: rarityStats(cards) };
    })
  );
  const statsMap = Object.fromEntries(stats.map(s => [s.id, s]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Packs</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {packs.length} pack{packs.length !== 1 ? 's' : ''}{draftCount > 0 ? ` · ${draftCount} draft${draftCount !== 1 ? 's' : ''}` : ''} · assign to any season
          </p>
        </div>
        <NewPackButton />
      </div>

      {packs.length === 0 ? (
        <div className="tcg-panel rounded-2xl py-20 text-center space-y-3">
          <p className="text-gray-500">No packs yet</p>
          <NewPackButton />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
          {packs.map(pack => {
            const { count, tiers } = statsMap[pack.id] ?? { count: 0, tiers: [] };
            const isDraft = pack.status === 'draft';
            const del = isDraft ? discardDraftPack.bind(null, pack.id) : deletePackAction.bind(null, pack.id);
            return (
              // Gradient rim = the card border. Active packs get the gold frame.
              <div
                key={pack.id}
                className={`rounded-[1.6rem] p-[3px] transition-all hover:-translate-y-1 ${
                  isDraft
                    ? 'bg-gradient-to-br from-amber-700/60 to-gray-800'
                    : pack.active
                    ? 'bg-gradient-to-br from-yellow-300 via-yellow-500 to-amber-600 shadow-glow'
                    : 'bg-gradient-to-br from-gray-600 to-gray-800'
                }`}
              >
                <div className="rounded-[1.4rem] bg-gray-900 overflow-hidden flex flex-col h-full">
                  <div className="p-3 pb-0">
                    <div className="holo-hover relative aspect-[4/3] rounded-xl overflow-hidden bg-gray-950 border border-white/10 flex items-center justify-center">
                      {pack.coverImageUrl ? (
                        <img src={pack.coverImageUrl} alt={pack.name} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <BrandMark size={64} />
                      )}
                      <span className="absolute top-2 right-2 font-display text-xs font-bold bg-gray-950/80 text-yellow-300 border border-yellow-500/40 rounded-full px-2.5 py-1">
                        {count} cards
                      </span>
                    </div>
                  </div>

                  <div className="p-4 space-y-3 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-display text-xl font-bold text-white leading-tight">{pack.name || 'Untitled pack'}</h2>
                      {isDraft ? <DraftChip /> : <StatusChip active={pack.active} />}
                    </div>

                    <div className="flex flex-wrap gap-1.5 min-h-[1.75rem]">
                      {tiers.filter(t => t.pct > 0).map(t => (
                        <span key={t.stars} className={`text-xs font-bold bg-white/5 rounded-md px-2 py-1 ${t.text}`}>
                          {'★'.repeat(t.stars)} <span className="text-gray-400 font-semibold">{t.pct}%</span>
                        </span>
                      ))}
                      {count === 0 && <span className="text-xs text-gray-600">No cards yet</span>}
                    </div>

                    <p className="text-xs text-gray-500 font-semibold">Draw weight {pack.weight}×</p>
                  </div>

                  <div className="px-4 pb-4 flex items-center gap-2">
                    <Link
                      href={isDraft ? `/admin/packs/new?draft=${pack.id}` : `/admin/packs/${pack.id}`}
                      className="tcg-btn flex-1 text-center px-3 py-2 text-sm rounded-xl"
                    >
                      {isDraft ? 'Continue setup →' : 'Manage →'}
                    </Link>
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
      )}
    </div>
  );
}

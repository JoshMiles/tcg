'use client';
import Link from 'next/link';
import { useRef, useState, useTransition, type DragEvent } from 'react';
import { Icon } from '@/app/components/Icon';
import { Spinner } from '../../components/PendingButton';
import { ConfirmButton } from '../../components/ConfirmButton';
import { removePackFromSeason } from '../../actions/seasons';
import { reorderSeasonPacksAction, setPackWeightAction } from '../../season-actions';

export interface LineupPack { id: string; name: string; coverImageUrl: string; weight: number; status: 'draft' | 'published'; active: boolean; cards: number; archived: boolean }

/**
 * The season's packs in order, with each pack's draw weight editable in place and its resulting share of draws. Drag a row (or use
 * the arrows) to reorder; the order saves as you go. Weight belongs to the pack, so editing it here changes it for every season
 * that uses the pack. Only published, active packs are ever drawn, and only they count towards the shares.
 */
export function LineupEditor({ seasonId, initial }: { seasonId: string; initial: LineupPack[] }) {
  const [packs, setPacks] = useState(initial);
  const [weights, setWeights] = useState<Record<string, string>>(() => Object.fromEntries(initial.map(p => [p.id, String(p.weight)])));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const drawn = (p: LineupPack) => p.status === 'published' && p.active && !p.archived && p.cards > 0;
  const w = (id: string) => { const n = Number(weights[id]); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const totalWeight = packs.filter(drawn).reduce((s, p) => s + w(p.id), 0);

  const persistOrder = (next: LineupPack[]) => startTransition(async () => {
    setError('');
    try { await reorderSeasonPacksAction(seasonId, next.map(p => p.id)); } catch { setError('Could not save the order.'); }
  });
  const move = (id: string, to: number) => {
    const from = packs.findIndex(p => p.id === id);
    if (from < 0 || to < 0 || to >= packs.length || from === to) return;
    const next = packs.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setPacks(next);
    persistOrder(next);
  };
  const saveWeight = (id: string, raw: string) => {
    const p = packs.find(x => x.id === id);
    const value = Number(raw);
    if (!p) return;
    // Anything that is not a weight (empty, negative) goes back to what is saved instead of staying in the box looking accepted.
    if (!raw.trim() || !Number.isFinite(value) || value < 0) { setWeights(x => ({ ...x, [id]: String(p.weight) })); return; }
    if (value === p.weight) return;
    startTransition(async () => {
      setError('');
      try { await setPackWeightAction(id, value); setPacks(list => list.map(x => (x.id === id ? { ...x, weight: value } : x))); } catch { setError('Could not save that weight.'); }
    });
  };
  const onDrop = (e: DragEvent, targetId: string) => {
    e.preventDefault();
    const id = dragId.current;
    dragId.current = null;
    setOverId(null);
    if (id && id !== targetId) move(id, packs.findIndex(p => p.id === targetId));
  };

  if (packs.length === 0) return <div className="tcg-panel rounded-xl p-8 text-center text-gray-600">No packs assigned. Add packs from your library below.</div>;

  return (
    <div className="space-y-2">
      {packs.map((pack, i) => {
        const share = drawn(pack) && totalWeight > 0 ? (w(pack.id) / totalWeight) * 100 : 0;
        return (
          <div
            key={pack.id}
            draggable
            onDragStart={e => { dragId.current = pack.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', pack.id); }}
            onDragOver={e => { if (dragId.current) { e.preventDefault(); setOverId(pack.id); } }}
            onDragLeave={() => setOverId(o => (o === pack.id ? null : o))}
            onDrop={e => onDrop(e, pack.id)}
            onDragEnd={() => { dragId.current = null; setOverId(null); }}
            className={`tcg-panel rounded-xl p-3 flex flex-wrap items-center gap-3 transition-shadow ${overId === pack.id ? 'shadow-[inset_0_3px_0_0_#eab308]' : ''}`}
          >
            <span className="text-gray-600 cursor-grab" title="Drag to reorder" aria-hidden><Icon name="grip" className="w-4 h-4" /></span>
            {pack.coverImageUrl ? <img src={pack.coverImageUrl} alt="" loading="lazy" className="w-9 h-12 object-cover rounded shrink-0" /> : <div className="w-9 h-12 bg-gray-800 rounded shrink-0" />}
            <div className="flex-1 min-w-[10rem]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-white text-sm">{pack.name}</span>
                {pack.archived ? <span className="text-xs px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded-md">Archived</span>
                  : pack.status === 'draft' ? <span className="text-xs px-1.5 py-0.5 bg-amber-900/50 text-amber-300 rounded-md">Draft</span>
                  : pack.active ? <span className="text-xs px-1.5 py-0.5 bg-green-900/60 text-green-400 rounded-md">Active</span>
                  : <span className="text-xs px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded-md">Inactive</span>}
                <span className="text-xs text-gray-600">{pack.cards} cards</span>
              </div>
              {drawn(pack) ? (
                <div className="mt-1.5 flex items-center gap-2" title="Share of the season's draws">
                  <div className="h-1.5 w-32 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-yellow-500 rounded-full" style={{ width: `${share}%` }} /></div>
                  <span className="text-xs text-gray-400 tabular-nums">{share.toFixed(share >= 10 ? 0 : 1)}% of draws</span>
                </div>
              ) : <p className="mt-1 text-xs text-gray-600">Not drawn{pack.status === 'draft' ? ' (draft)' : !pack.active ? ' (inactive)' : pack.cards === 0 ? ' (no cards)' : ''}</p>}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-500" title="Draw weight: shared by every season that uses this pack">
              Weight
              <input
                type="number" min={0} step="any" value={weights[pack.id]}
                onChange={e => setWeights(x => ({ ...x, [pack.id]: e.target.value }))}
                onBlur={e => saveWeight(pack.id, e.currentTarget.value)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                aria-label={`Draw weight for ${pack.name}`}
                className="w-16 rounded-lg bg-gray-950 border border-gray-700 px-2 py-1 text-right text-sm text-white tabular-nums focus:outline-none focus:border-yellow-500"
              />
            </label>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => move(pack.id, i - 1)} disabled={i === 0} aria-label={`Move ${pack.name} up`} className="w-7 h-7 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30"><Icon name="chevronUp" className="w-4 h-4" /></button>
              <button type="button" onClick={() => move(pack.id, i + 1)} disabled={i === packs.length - 1} aria-label={`Move ${pack.name} down`} className="w-7 h-7 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30"><Icon name="chevronDown" className="w-4 h-4" /></button>
              <Link href={`/admin/packs/${pack.id}`} className="px-2.5 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors ml-1">Edit</Link>
              <form action={removePackFromSeason.bind(null, seasonId, pack.id)}>
                <ConfirmButton
                  title="Remove pack from this season?"
                  confirmLabel="Remove"
                  message={<>Remove <strong className="text-white">{pack.name}</strong> from this season? The pack itself is kept and can be added back.</>}
                  className="px-2.5 py-1 text-xs bg-red-900/50 hover:bg-red-900 text-red-400 rounded transition-colors"
                >
                  Remove
                </ConfirmButton>
              </form>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-gray-600 flex items-center gap-2">
        {pending && <Spinner />}Shares count only published, active packs with cards. Weight is the pack&apos;s own setting, so changing it here changes it for every season that uses the pack.
      </p>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

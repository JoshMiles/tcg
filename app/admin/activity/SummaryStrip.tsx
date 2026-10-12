import { Icon } from '@/app/components/Icon';
import type { Rates } from '@/lib/activity-view';
import { Tile } from '../components/ui';

function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-px h-8 w-full" aria-hidden>
      {values.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm bg-yellow-500/70" style={{ height: `${Math.max(v > 0 ? 12 : 4, (v / max) * 100)}%`, opacity: v > 0 ? 1 : 0.25 }} />
      ))}
    </div>
  );
}

/** Pulls per minute / hour, viewers, rare pulls and a 30 minute sparkline, from the events loaded on the page; plus a spike warning. */
export function SummaryStrip({ rates, onFilterRare }: { rates: Rates; onFilterRare: () => void }) {
  return (
    <div className="space-y-3">
      {rates.spike && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-100">
          <Icon name="zap" className="text-amber-300" />
          <span><strong>Busy right now:</strong> {rates.spike.recent} pulls in the last 2 minutes (usually about {rates.spike.usual}). A raid, a gift bomb or a stuck trigger?</span>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile label="Pulls / min" value={rates.perMinute.toFixed(1)} sub="last 5 minutes" />
        <Tile label="Pulls (hour)" value={rates.lastHour} sub={`${rates.newCardsLastHour} new cards`} />
        <Tile label="Viewers (hour)" value={rates.viewersLastHour} sub="pulled at least once" />
        <button type="button" onClick={onFilterRare} className="text-left rounded-xl border border-gray-800 bg-gray-900/70 hover:border-yellow-500/40 px-4 py-3 transition-colors" title="Show only the rare pulls">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Rare (hour)</p>
          <p className="font-display text-2xl font-bold text-yellow-300 tabular-nums leading-tight">{rates.rareLastHour}</p>
          <p className="text-[11px] text-gray-500">5★, Full Art or Shiny</p>
        </button>
        <div className="rounded-xl border border-gray-800 bg-gray-900/70 px-4 py-3 col-span-2 lg:col-span-1">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">Last 30 minutes</p>
          <Spark values={rates.spark} />
        </div>
      </div>
    </div>
  );
}

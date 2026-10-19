import type { PackInput } from '../draft-actions';
import { BrandMark } from './BrandMark';

/** Live preview of how a pack will look, shown beside the wizard's form steps. */
export function PackPreview({ pack, cardCount }: { pack: PackInput; cardCount: number }) {
  const w = pack.variantWeights;
  const total = w.regular + w.reverse + w.full + w.shiny;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <div className="card rounded-2xl p-4 space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Preview</p>
      <div
        className="relative aspect-4/3 rounded-xl overflow-hidden bg-gray-950 border flex items-center justify-center"
        style={{ borderColor: pack.tearBorderColor, boxShadow: `0 0 28px -8px ${pack.accentColor}` }}
      >
        {pack.coverImageUrl ? (
          <img src={pack.coverImageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <BrandMark size={64} />
        )}
        <div className="absolute bottom-0 inset-x-0 h-2" style={{ background: pack.tearBorderColor }} />
        <span className="absolute top-2 right-2 text-[10px] font-bold bg-gray-950/80 border rounded-full px-2 py-0.5" style={{ color: pack.accentColor, borderColor: pack.accentColor }}>
          {cardCount} card{cardCount === 1 ? '' : 's'}
        </span>
      </div>
      <p className="font-display text-lg font-bold text-white leading-tight truncate">{pack.name || 'Untitled pack'}</p>
      {pack.upgradesEnabled && total > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
          <span className="rounded-md bg-white/5 px-2 py-1 text-gray-300">Regular {pct(w.regular).toFixed(0)}%</span>
          <span className="rounded-md bg-white/5 px-2 py-1 text-fuchsia-300">Reverse {pct(w.reverse).toFixed(1)}%</span>
          <span className="rounded-md bg-white/5 px-2 py-1 text-sky-300">Full Art {pct(w.full).toFixed(1)}%</span>
          <span className="rounded-md bg-white/5 px-2 py-1 text-amber-300">Shiny {pct(w.shiny).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

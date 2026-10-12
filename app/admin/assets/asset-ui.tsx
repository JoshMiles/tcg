import { Icon } from '@/app/components/Icon';
import type { AssetIssue, AssetKind, AssetOrigin, LibraryAsset } from '@/lib/assets';

// Small shared pieces for the Assets page (client-safe).

export const ISSUE_TEXT: Record<AssetIssue, { label: string; hint: string; tone: 'red' | 'amber'; fixable: boolean }> = {
  'legacy-gif': { label: 'GIF', hint: 'Still a GIF, which is huge. Fix it to convert it to an optimized WebP.', tone: 'amber', fixable: true },
  missing: { label: 'File missing', hint: 'This URL no longer resolves, so viewers will see a broken image or sound. Replace the file.', tone: 'red', fixable: false },
  'no-thumbnail': { label: 'No thumbnail', hint: 'The static thumbnail next to this card art is missing, so grids show a broken image. Fix it to regenerate it.', tone: 'amber', fixable: true },
  heavy: { label: 'Very large', hint: 'Unusually large for its type. Fix it to re-encode card art at the standard size.', tone: 'amber', fixable: true },
};

export const KIND_LABEL: Record<AssetKind, string> = { 'card-art': 'Card art', 'pack-cover': 'Pack cover', sound: 'Sound' };

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function filename(url: string): string {
  try { return decodeURIComponent(new URL(url, 'http://x').pathname.split('/').pop() ?? ''); } catch { return url.split('/').pop() ?? url; }
}

/** Can the Fix button do something for this file? Missing files and sounds need a replacement instead. */
export const isFixable = (a: LibraryAsset) => a.kind !== 'sound' && !a.issues.includes('missing') && a.issues.some(i => ISSUE_TEXT[i].fixable);

export const assetTitle = (o: AssetOrigin) => (o.kind === 'pack-cover' ? o.packName : o.cardName);
export const originHref = (o: AssetOrigin) => (o.kind === 'pack-cover' ? `/admin/packs/${o.packId}?tab=settings` : `/admin/packs/${o.packId}/cards/${o.cardId}`);
export const originLabel = (o: AssetOrigin) => (o.kind === 'pack-cover' ? `${o.packName} (cover)` : `${o.cardName} · #${o.cardNumber} · ${o.packName}`);

export function IssueChips({ asset }: { asset: LibraryAsset }) {
  if (asset.issues.length === 0) {
    return asset.optimized
      ? <span className="text-[10px] font-extrabold uppercase tracking-wider text-green-300 bg-green-500/10 border border-green-400/30 rounded-full px-1.5 py-px"><Icon name="check" className="mr-0.5 w-3 h-3" />Optimized</span>
      : null;
  }
  return (
    <>
      {asset.issues.map(issue => {
        const info = ISSUE_TEXT[issue];
        return (
          <span key={issue} title={info.hint} className={`text-[10px] font-extrabold uppercase tracking-wider rounded-full px-1.5 py-px border cursor-help ${info.tone === 'red' ? 'text-red-300 bg-red-500/10 border-red-400/30' : 'text-amber-300 bg-amber-500/10 border-amber-400/30'}`}>
            <Icon name="warning" className="mr-1 w-3.5 h-3.5" />{info.label}
          </span>
        );
      })}
    </>
  );
}

/** A horizontal bar showing `value` against `max` (used for sizes and pack weights). */
export function SizeBar({ value, max, tone = 'yellow', className = '' }: { value: number; max: number; tone?: 'yellow' | 'amber' | 'sky'; className?: string }) {
  const color = tone === 'amber' ? 'bg-amber-400/80' : tone === 'sky' ? 'bg-sky-400/80' : 'bg-yellow-400/80';
  return (
    <div className={`h-1.5 rounded-full bg-gray-800 overflow-hidden ${className}`} aria-hidden>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

/** Does a dropped / chosen file suit this kind of asset? */
export function fileSuits(kind: AssetKind, file: File): boolean {
  return kind === 'sound' ? file.type.startsWith('audio/') : file.type.startsWith('image/');
}

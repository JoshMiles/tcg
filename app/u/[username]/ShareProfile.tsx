'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { exportShare } from '@/app/components/ShareImage';
import { ReportDialog } from './ReportDialog';
import type { ShareSpec } from '@/lib/share-image';

/**
 * The profile's one Share button: a menu with the link and, when there are cards to show, a quick image of the cards.
 * It says "my cards" only on your own profile; the owner also gets a way into the Share tab to pick a look.
 */
export function ShareProfile({ name, username, isOwner, spec, customiseHref, canReport = false }: {
  canReport?: boolean;
  name: string;
  username: string;
  isOwner: boolean;
  spec?: ShareSpec;
  customiseHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const url = () => window.location.origin + window.location.pathname.replace(/\/$/, ''); // the profile itself, never a tab or filter
  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(null), 2200); };

  async function copy() {
    try { await navigator.clipboard.writeText(url()); flash('Link copied'); } catch { flash('Could not copy'); }
    setOpen(false);
  }
  async function sheet() {
    setOpen(false);
    try { await navigator.share({ title: `${name} on The Cheesy TCG`, url: url() }); } catch (e) { if ((e as Error)?.name !== 'AbortError') flash('Could not share'); }
  }
  async function image() {
    if (!spec) return;
    setOpen(false); setBusy(true);
    try { const r = await exportShare(spec, `cheesy-tcg-${username}.png`, { url: url() }); if (r === 'downloaded') flash('Image saved'); } catch { flash('Could not make the image'); }
    setBusy(false);
  }

  const item = 'w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10 focus:bg-white/10 focus:outline-none';
  const hasCards = !!spec && spec.cards.length > 0;
  return (
    <div ref={root} className="relative">
      <button
        type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} disabled={busy}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-200 bg-white/[0.06] border border-white/10 hover:bg-white/10 rounded-full px-3 py-1.5 transition-colors disabled:opacity-60"
      >
        <Icon name={note?.startsWith('Link copied') ? 'check' : 'link'} className={note?.startsWith('Link copied') ? 'text-green-400' : ''} />
        {busy ? 'Making image…' : note ?? 'Share'}
        <Icon name="chevronDown" className="w-3 h-3 text-gray-400" />
      </button>
      {open && (
        <div role="menu" aria-label="Share" className="absolute left-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl py-1">
          <button role="menuitem" type="button" onClick={copy} className={item}><Icon name="link" className="text-gray-400" />Copy profile link</button>
          {canNativeShare && <button role="menuitem" type="button" onClick={sheet} className={item}><Icon name="share" className="text-gray-400" />Share link…</button>}
          {hasCards && (
            <button role="menuitem" type="button" onClick={image} className={item}>
              <Icon name="image" className="text-gray-400" />{isOwner ? 'Image of my top cards' : `Image of ${name}’s top cards`}
            </button>
          )}
          {canReport && (
            <button role="menuitem" type="button" onClick={() => { setOpen(false); setReporting(true); }} className={`${item} border-t border-gray-800`}>
              <Icon name="flag" className="text-gray-400" />Report {name}
            </button>
          )}
          {isOwner && customiseHref && (
            <Link role="menuitem" href={customiseHref} onClick={() => setOpen(false)} className={`${item} border-t border-gray-800 text-yellow-300`}>
              <Icon name="palette" />Customise image…
            </Link>
          )}
        </div>
      )}
      {reporting && <ReportDialog target={username} name={name} onClose={() => setReporting(false)} />}
    </div>
  );
}
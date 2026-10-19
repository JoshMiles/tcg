'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { exportShare, renderShare } from './ShareImage';
import { SHARE_OFF_MESSAGE } from '@/lib/discord-config';
import { FORMATS, SHARE_THEMES, type BigStat, type ShareCard, type ShareFormat, type ShareSpec } from '@/lib/share-image';

type Template = 'cards' | 'stats';
const CARD_COUNTS = [1, 3, 6, 9] as const;
type CardCount = (typeof CARD_COUNTS)[number];
type CardPreset = CardCount | 'custom';

function firstCards(n: number, total: number): number[] {
  return Array.from({ length: Math.min(n, total) }, (_, i) => i);
}

function presetFor(count: number): CardPreset {
  return (CARD_COUNTS as readonly number[]).includes(count) ? count as CardCount : 'custom';
}

/**
 * Pick a look, a shape and (for a profile) which cards go in, see the image, then share, download or copy the link.
 * Used on a profile's Share tab (with `candidates`) and under a single card copy (without).
 */
export function ShareStudio({ base, candidates, bigStats, link, filename, shareText, defaultCount = 6, maxCards = 9, discordOn }: {
  base: ShareSpec;
  /** Cards the viewer can choose from, best first. Leave out when the image has a fixed card (a single copy). */
  candidates?: ShareCard[];
  /** Enables the "Stats poster" template. */
  bigStats?: BigStat[];
  link?: string;
  filename: string;
  shareText?: string;
  defaultCount?: number;
  maxCards?: number;
  /** Set on the owner's share tab. Omit on a single copy, which has no Discord button. */
  discordOn?: boolean;
}) {
  const [theme, setTheme] = useState(base.theme ?? 'classic');
  const [format, setFormat] = useState<ShareFormat>(base.format ?? 'post');
  const [template, setTemplate] = useState<Template>('cards');
  const [preset, setPreset] = useState<CardPreset>(presetFor(defaultCount));
  const [picked, setPicked] = useState<number[]>(() => firstCards(defaultCount, candidates?.length ?? 0));
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<'share' | 'download' | 'discord' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const run = useRef(0);

  const spec: ShareSpec = {
    ...base, theme, format,
    cards: candidates ? picked.map(i => candidates[i]).filter(Boolean) : base.cards,
    bigStats: candidates && template === 'stats' ? bigStats : undefined,
  };
  const specKey = JSON.stringify([theme, format, template, picked, base.title]);

  useEffect(() => {
    const id = ++run.current;
    const timer = setTimeout(async () => {
      try {
        const canvas = await renderShare(spec, { preview: true });
        if (id === run.current) setPreview(canvas.toDataURL('image/jpeg', 0.85));
      } catch { if (id === run.current) setPreview(null); }
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey]);

  function chooseCount(n: CardCount) {
    setPreset(n);
    setPicked(firstCards(n, candidates?.length ?? 0));
  }
  function toggle(i: number) {
    setPreset('custom');
    setPicked(p => (p.includes(i) ? p.filter(x => x !== i) : p.length >= maxCards ? p : [...p, i]));
  }
  async function go(kind: 'share' | 'download') {
    setBusy(kind); setNote(null);
    try {
      const r = await exportShare(spec, filename, { text: shareText, url: link, download: kind === 'download' });
      if (r === 'downloaded') setNote('Saved to your downloads.');
    } catch { setNote('Could not make the image. Try again.'); }
    setBusy(null);
  }
  async function postDiscord() {
    setBusy('discord'); setNote(null);
    if (!discordOn) { setNote(SHARE_OFF_MESSAGE); setBusy(null); return; }
    try {
      const canvas = await renderShare(spec);
      const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('no image');
      const res = await fetch('/api/account/share', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
      const data = await res.json().catch(() => null) as { error?: string } | null;
      setNote(data?.error ?? (res.ok ? 'Posted to Discord.' : 'Could not post the image. Try again.'));
    } catch { setNote('Could not make the image. Try again.'); }
    setBusy(null);
  }
  async function copyLink() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setNote('Link copied.'); } catch { setNote('Could not copy the link.'); }
  }

  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${on ? 'bg-yellow-400 text-gray-950 border-yellow-400' : 'bg-white/4 text-gray-300 border-white/10 hover:bg-white/10'}`;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,280px)_1fr] items-start">
      <div className="mx-auto w-full max-w-[280px]">
        <div className="rounded-xl overflow-hidden border border-gray-800 bg-gray-950" style={{ aspectRatio: format === 'story' ? '9 / 16' : '4 / 5' }}>
          {preview
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={preview} alt="Preview of the share image" className="w-full h-full object-cover" />
            : <div className="w-full h-full grid place-items-center text-xs text-gray-500">Making preview…</div>}
        </div>
      </div>

      <div className="space-y-5 min-w-0">
        <fieldset>
          <legend className="text-[11px] uppercase tracking-wider font-bold text-gray-500 mb-2">Theme</legend>
          <div className="flex flex-wrap gap-2">
            {SHARE_THEMES.map(t => (
              <button key={t.id} type="button" onClick={() => setTheme(t.id)} aria-pressed={theme === t.id} className={`${chip(theme === t.id)} inline-flex items-center gap-2`}>
                <span className="w-3.5 h-3.5 rounded-full border border-white/30" style={{ background: `linear-gradient(135deg, ${t.bg[0]}, ${t.chipText})` }} />{t.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[11px] uppercase tracking-wider font-bold text-gray-500 mb-2">Shape</legend>
          <div className="flex flex-wrap gap-2">
            {FORMATS.map(f => <button key={f.id} type="button" onClick={() => setFormat(f.id)} aria-pressed={format === f.id} className={chip(format === f.id)}>{f.label}</button>)}
          </div>
        </fieldset>

        {candidates && bigStats && (
          <fieldset>
            <legend className="text-[11px] uppercase tracking-wider font-bold text-gray-500 mb-2">Layout</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setTemplate('cards')} aria-pressed={template === 'cards'} className={chip(template === 'cards')}>Cards</button>
              <button type="button" onClick={() => setTemplate('stats')} aria-pressed={template === 'stats'} className={chip(template === 'stats')}>Stats poster</button>
            </div>
          </fieldset>
        )}

        {candidates && (
          <fieldset>
            <legend className="text-[11px] uppercase tracking-wider font-bold text-gray-500 mb-2">Cards in the image ({picked.length}/{Math.min(maxCards, candidates.length)})</legend>
            <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="How many cards">
              {CARD_COUNTS.map(n => (
                <button key={n} type="button" onClick={() => chooseCount(n)} aria-pressed={preset === n} className={chip(preset === n)}>
                  {n === 1 ? 'My best 1' : `Top ${n}`}
                </button>
              ))}
              <button type="button" onClick={() => setPreset('custom')} aria-pressed={preset === 'custom'} className={chip(preset === 'custom')}>Custom</button>
            </div>
            <ul className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {candidates.map((c, i) => {
                const on = picked.includes(i);
                return (
                  <li key={i}>
                    <button type="button" onClick={() => toggle(i)} aria-pressed={on} aria-label={`${c.name}${c.tag ? ` ${c.tag}` : ''}`} className={`relative block w-full rounded-lg overflow-hidden border-2 ${on ? 'border-yellow-400' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.thumb ?? c.src} alt="" loading="lazy" decoding="async" className="w-full aspect-2/3 object-cover bg-gray-900" />
                      {on && <span className="absolute top-1 right-1 rounded-full bg-yellow-400 text-gray-950 w-5 h-5 grid place-items-center text-[11px]"><Icon name="check" /></span>}
                      {c.tag && <span className="absolute bottom-1 left-1 rounded-sm bg-black/70 text-yellow-300 text-[10px] font-bold px-1">{c.tag}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => go('share')} disabled={!!busy || (!!candidates && picked.length === 0)} className="btn btn-primary px-4 py-2 text-sm rounded-xl disabled:opacity-60">
            <Icon name="image" className="mr-1.5" />{busy === 'share' ? 'Making image…' : 'Share image'}
          </button>
          <button type="button" onClick={() => go('download')} disabled={!!busy || (!!candidates && picked.length === 0)} className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-200 bg-white/6 border border-white/10 hover:bg-white/10 rounded-xl px-4 py-2 disabled:opacity-60">
            <Icon name="download" />Download
          </button>
          {discordOn !== undefined && (
            <button type="button" onClick={postDiscord} disabled={!!busy || (!!candidates && picked.length === 0)} className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-200 bg-white/6 border border-white/10 hover:bg-white/10 rounded-xl px-4 py-2 disabled:opacity-60">
              <Icon name="send" />{busy === 'discord' ? 'Posting…' : 'Post to Discord'}
            </button>
          )}
          {link && (
            <button type="button" onClick={copyLink} className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-200 bg-white/6 border border-white/10 hover:bg-white/10 rounded-xl px-4 py-2">
              <Icon name="link" />Copy link
            </button>
          )}
          {note && <span role="status" className="text-xs text-gray-400">{note}</span>}
        </div>
      </div>
    </div>
  );
}

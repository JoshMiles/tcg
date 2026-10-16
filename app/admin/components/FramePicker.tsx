'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { isFrameSourceUrl } from '@/lib/card-art';
import { renderStillAction } from '../still-actions';

const frameSrc = (url: string, n: number, w: number) => `/api/admin/card-frames?url=${encodeURIComponent(url)}&n=${n}&w=${w}`;

/**
 * Picks which frame of an animated card is its still image (the first frame is sometimes blank or mid-transition). A slider scrubs
 * the frames with a live preview, eight evenly spaced frames are one click away, and "Use this frame" stores that frame as the
 * card's still. `value` is the chosen still's URL ('' = the first frame); `onChange` hands back the new one, and the card's own save
 * (or the wizard's autosave) keeps it.
 */
export function FramePicker({ artUrl, value, onChange, label = 'Choose still frame', compact }: { artUrl: string; value: string; onChange: (url: string) => void; label?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<{ frames: number; delayMs: number } | null>(null);
  const [problem, setProblem] = useState('');
  const [frame, setFrame] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !artUrl || !isFrameSourceUrl(artUrl)) return;
    let live = true;
    setInfo(null); setProblem(''); setFrame(0);
    fetch(`/api/admin/card-frames?url=${encodeURIComponent(artUrl)}`, { cache: 'no-store' })
      .then(async r => { if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Could not read the art.'); return r.json() as Promise<{ frames: number; delayMs: number }>; })
      .then(i => { if (live) setInfo(i); })
      .catch(e => { if (live) setProblem(e instanceof Error ? e.message : 'Could not read the art.'); });
    return () => { live = false; };
  }, [open, artUrl]);

  if (!artUrl || !isFrameSourceUrl(artUrl)) return null;

  const frames = info?.frames ?? 0;
  const picks = frames > 1 ? [...new Set(Array.from({ length: Math.min(8, frames) }, (_, i) => Math.floor((i * frames) / Math.min(8, frames))))] : [];

  async function use() {
    setBusy(true); setProblem('');
    const r = await renderStillAction(artUrl, frame).catch(() => ({ ok: false as const, error: 'Could not store the still.' }));
    setBusy(false);
    if (r.ok) { onChange(r.url); setOpen(false); } else setProblem(r.error);
  }

  return (
    <div className={compact ? 'text-xs' : 'text-sm'}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1 text-gray-300 hover:text-white hover:border-gray-500 transition-colors">
          <Icon name="image" />{label}
        </button>
        {value && <span className="text-emerald-400">Custom still set</span>}
        {value && <button type="button" onClick={() => onChange('')} className="text-gray-500 hover:text-white underline">Reset to first frame</button>}
      </div>
      {open && (
        <div className="mt-2 rounded-xl border border-gray-800 bg-gray-950/60 p-3 space-y-3 max-w-md">
          {problem ? <p role="alert" className="text-red-300">{problem}</p>
            : !info ? <p className="text-gray-500">Loading frames…</p>
            : frames < 2 ? <p className="text-gray-500">This art has a single frame, so there is nothing to choose.</p> : (
              <>
                <div className="flex gap-3 items-start">
                  <img src={frameSrc(artUrl, frame, 260)} alt={`Frame ${frame + 1} of ${frames}`} className="w-32 aspect-[2/3] object-cover rounded-lg border border-gray-700 bg-gray-900" />
                  <div className="flex-1 space-y-2 min-w-0">
                    <label className="block text-gray-400">Frame {frame + 1} of {frames}
                      <input type="range" min={0} max={frames - 1} step={1} value={frame} onChange={e => setFrame(Number(e.target.value))} aria-label="Frame" className="w-full accent-yellow-400" />
                    </label>
                    <button type="button" onClick={use} disabled={busy} className="px-3 py-1.5 tcg-btn rounded-lg disabled:opacity-50">{busy ? 'Saving…' : 'Use this frame'}</button>
                  </div>
                </div>
                <div>
                  <p className="text-gray-500 mb-1.5">Suggestions</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {picks.map(n => (
                      <li key={n}>
                        <button type="button" onClick={() => setFrame(n)} aria-label={`Frame ${n + 1}`} aria-pressed={frame === n} className={`block rounded-md overflow-hidden border-2 ${frame === n ? 'border-yellow-400' : 'border-transparent hover:border-gray-600'}`}>
                          <img src={frameSrc(artUrl, n, 90)} alt="" loading="lazy" className="w-10 aspect-[2/3] object-cover bg-gray-900" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
        </div>
      )}
    </div>
  );
}

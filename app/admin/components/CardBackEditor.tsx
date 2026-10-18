'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { FlipCard } from '@/app/components/FlipCard';
import { Icon } from '@/app/components/Icon';
import { saveCardBackAction, resetCardBackAction, loadCardBackAction } from '../card-back-actions';
import { BACK_FONTS, DEFAULT_CARD_BACK, isDefaultCardBack, resolveCardBack, type CardBackStyle } from '@/lib/card-back';
import { loadBackFont } from '@/lib/card-back-fonts';
import { EDITOR_PRESETS, tinyText, type Box } from '@/lib/card-back-edit';
import { sampleFlipBack, type FlipBack } from '@/lib/flip-back';
import { Canvas, type Boxes } from './card-back/Canvas';
import { Layers } from './card-back/Layers';
import { Properties } from './card-back/Properties';

/**
 * The "Card back" section of a pack (ROADMAP 20.1, 20.3b): a live preview with presets, Copy from another pack, Reset and Save, and **Edit design**,
 * which opens the visual editor: a canvas to drag, resize, scale and rotate elements, a layers list, the properties of the selection, the same back at
 * three sizes, undo and redo. Self-contained (its own props and server actions, no assumption about the page around it).
 */
export interface CardBackEditorProps {
  packId: string;
  packName: string;
  /** Season name for the `{season}` token in the preview (any season the pack is in). */
  seasonName?: string;
  coverImageUrl?: string;
  /** The stored design; null = the classic look. */
  initial: CardBackStyle | null;
  /** A card of this pack for the sample print. */
  sample: { name: string; imageUrl: string; hex?: string };
  /** Other packs to copy a design from. */
  others: { id: string; name: string }[];
  /** `stacked` puts the preview above the controls (for a narrow panel); `wide` puts it beside them. */
  layout?: 'wide' | 'stacked';
}

const btn = 'px-3 py-2 text-sm font-bold rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white disabled:opacity-50';
const field = 'bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-hidden focus:border-yellow-500';

export function CardBackEditor({ packId, packName, seasonName, coverImageUrl, initial, sample, others, layout = 'wide' }: CardBackEditorProps) {
  const start = initial ?? DEFAULT_CARD_BACK;
  const [style, setStyleState] = useState<CardBackStyle>(start);
  const styleRef = useRef(start);
  const [saved, setSaved] = useState(JSON.stringify(start));
  const past = useRef<CardBackStyle[]>([]);
  const future = useRef<CardBackStyle[]>([]);
  const lastKey = useRef({ key: '', at: 0 });
  const [, tick] = useState(0);
  const [selection, setSelection] = useState<Set<string>>(new Set(['bg']));
  const [boxes, setBoxes] = useState<Boxes>({});
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(true);
  const [note, setNote] = useState('');
  const [from, setFrom] = useState('');
  const [pending, run] = useTransition();
  const stage = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(340);

  const dirty = JSON.stringify(style) !== saved;
  const setStyle = useCallback((s: CardBackStyle) => { styleRef.current = s; setStyleState(s); setNote(''); }, []);
  /** An edit that is one undo step (edits with the same `key` within a moment count as one). */
  const change = useCallback((next: CardBackStyle, key?: string) => {
    const now = Date.now();
    if (!(key && key === lastKey.current.key && now - lastKey.current.at < 800)) past.current = [...past.current.slice(-59), styleRef.current];
    lastKey.current = { key: key ?? '', at: now };
    future.current = [];
    setStyle(next); tick(n => n + 1);
  }, [setStyle]);
  /** The start of a drag (or a burst of nudges): the whole gesture is one undo step. */
  const gesture = useCallback((key?: string) => {
    const now = Date.now();
    if (key && key === lastKey.current.key && now - lastKey.current.at < 800) { lastKey.current.at = now; return; }
    past.current = [...past.current.slice(-59), styleRef.current]; future.current = []; lastKey.current = { key: key ?? '', at: now }; tick(n => n + 1);
  }, []);
  const undo = useCallback(() => { const p = past.current.pop(); if (!p) return; future.current.push(styleRef.current); lastKey.current = { key: '', at: 0 }; setStyle(p); tick(n => n + 1); }, [setStyle]);
  const redo = useCallback(() => { const f = future.current.pop(); if (!f) return; past.current.push(styleRef.current); lastKey.current = { key: '', at: 0 }; setStyle(f); tick(n => n + 1); }, [setStyle]);

  const live = useMemo(() => resolveCardBack(style, { packName, seasonName, cover: coverImageUrl })!, [style, packName, seasonName, coverImageUrl]);
  const hex = sample.hex ?? '#facc15';
  const back: FlipBack = useMemo(() => ({ ...sampleFlipBack(sample.name, hex), href: '#' }), [sample.name, hex]);
  const tiny = tinyText(style);

  // The editor: fonts for the previews in the font list, the canvas width, Escape and the undo keys.
  useEffect(() => { if (open) for (const f of BACK_FONTS) if (f.files) void loadBackFont(f.id, 400); }, [open]);
  useEffect(() => {
    const el = stage.current;
    if (!open || !el) return;
    const ro = new ResizeObserver(() => setCanvasW(Math.max(220, Math.min(380, el.clientWidth - 8))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
      if (e.key === 'Escape' && !typing) { setOpen(false); return; }
      if (typing || !(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); } else if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, undo, redo]);

  const exec = (fn: () => Promise<CardBackStyle>, done: string) => run(async () => {
    try { const next = await fn(); setStyle(next); setSaved(JSON.stringify(next)); past.current = []; future.current = []; setNote(done); }
    catch (err) { setNote(err instanceof Error ? err.message : 'That did not work'); }
  });
  const save = () => exec(() => saveCardBackAction(packId, style), 'Saved');
  const preset = (s: CardBackStyle) => { change(s); setSelection(new Set(['bg'])); };

  const panelCard = (
    <FlipCard key={`${live.pattern}-${live.elements.length}`} defaultFlipped back={{ ...back, style: live }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={sample.imageUrl} alt={sample.name} className="w-full h-full object-cover rounded-xl border-2" style={{ borderColor: hex }} />
    </FlipCard>
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <button type="button" onClick={() => setOpen(true)} className="px-4 py-2 tcg-btn rounded-xl text-sm"><Icon name="palette" className="mr-1.5" />Edit design</button>
      <button type="button" disabled={pending || !dirty} onClick={save} className={`${btn} text-white! bg-gray-700`}>{pending ? 'Working…' : 'Save card back'}</button>
      <button type="button" disabled={pending || (isDefaultCardBack(style) && !dirty && !initial)} onClick={() => exec(resetCardBackAction.bind(null, packId), 'Back to the classic look')} className={btn}>Reset to default</button>
      {others.length > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <select aria-label="Copy from another pack" value={from} onChange={e => setFrom(e.target.value)} className={field}>
            <option value="">Copy from another pack…</option>
            {others.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button type="button" disabled={pending || !from} onClick={() => run(async () => { try { change(await loadCardBackAction(from)); setNote('Copied. Press Save to keep it.'); } catch { setNote('That did not work'); } })} className={btn}>Copy</button>
        </span>
      )}
      <span role="status" className="text-xs text-gray-400">{note || (dirty ? 'Unsaved changes' : '')}</span>
    </div>
  );

  return (
    <div id="card-back" className="tcg-panel rounded-2xl overflow-hidden scroll-mt-20">
      <div className="px-5 py-4 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-white">Card back</h3>
        <p className="text-xs text-gray-500 mt-0.5">How the back of a print looks for cards from this pack. Until you save a design, it keeps the classic engraved plate.</p>
      </div>
      <div className={`p-5 grid gap-6 items-start ${layout === 'wide' ? 'lg:grid-cols-[240px_1fr]' : ''}`}>
        <div className="mx-auto w-full max-w-[220px]">{panelCard}</div>
        <div className="space-y-4 min-w-0">
          <div role="group" aria-label="Presets" className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400 mr-1">Start from</span>
            {EDITOR_PRESETS.map(p => <button key={p.id} type="button" onClick={() => preset(p.style)} className="px-2.5 py-1 text-xs font-bold rounded-lg border bg-gray-800 border-gray-700 text-gray-300 hover:text-white">{p.label}</button>)}
          </div>
          {actions}
        </div>
      </div>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Card back editor" className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-800">
            <h2 className="text-sm font-bold text-white mr-auto">Card back: {packName}</h2>
            <button type="button" onClick={undo} disabled={past.current.length === 0} aria-label="Undo" title="Undo (Ctrl+Z)" className="p-2 rounded-lg border border-gray-700 text-gray-200 disabled:opacity-40"><Icon name="undo" /></button>
            <button type="button" onClick={redo} disabled={future.current.length === 0} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className="p-2 rounded-lg border border-gray-700 text-gray-200 disabled:opacity-40"><Icon name="redo" /></button>
            <select aria-label="Presets" value="" onChange={e => { const p = EDITOR_PRESETS.find(x => x.id === e.target.value); if (p) preset(p.style); }} className={`${field} hidden sm:block`}>
              <option value="">Preset…</option>{EDITOR_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <span role="status" className="text-xs text-gray-400">{note || (dirty ? 'Unsaved changes' : 'Saved')}</span>
            <button type="button" disabled={pending || !dirty} onClick={save} className="px-4 py-2 tcg-btn rounded-lg text-sm disabled:opacity-50">{pending ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close the editor" className="p-2 rounded-lg border border-gray-700 text-gray-200"><Icon name="x" /></button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden grid lg:grid-cols-[17rem_minmax(0,1fr)_21rem]">
            <div className="order-2 lg:order-1 p-3 lg:overflow-y-auto border-t lg:border-t-0 lg:border-r border-gray-800">
              <Layers style={live} selection={selection} boxes={boxes as Record<string, Box>} onSelect={setSelection} onChange={change} />
            </div>

            <div ref={stage} className="order-1 lg:order-2 p-3 lg:overflow-y-auto flex flex-col items-center gap-5 min-w-0">
              <Canvas style={live} back={back} width={canvasW} selection={selection} onSelect={setSelection} onGesture={gesture} onChange={setStyle} onBoxes={setBoxes} />
              {tiny.length > 0 && (
                <p role="alert" className="text-xs text-amber-300 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 max-w-md">
                  Some text will be very small on a tile ({tiny.length} {tiny.length === 1 ? 'element is' : 'elements are'} under 9 px at tile size). Make it bigger or leave it out.
                </p>
              )}
              <div className="flex flex-wrap items-end justify-center gap-6">
                {([['Tile', 120, true], ['Print page', 240, false], ['Large', 360, false]] as const).map(([label, w, compact]) => (
                  <figure key={label} className="text-center">
                    <div style={{ width: Math.min(w, canvasW + 40) }}><FlipCard bare compact={compact} back={{ ...back, style: live }}>{null}</FlipCard></div>
                    <figcaption className="text-[11px] text-gray-500 mt-1">{label}</figcaption>
                  </figure>
                ))}
              </div>
            </div>

            <aside aria-label="Properties" className={`order-3 border-t lg:border-t-0 lg:border-l border-gray-800 bg-gray-950 lg:overflow-y-auto ${sheet ? '' : 'max-lg:hidden'} max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:max-h-[55vh] max-lg:overflow-y-auto max-lg:z-10 max-lg:shadow-2xl`}>
              <div className="lg:hidden flex justify-end px-3 pt-2"><button type="button" onClick={() => setSheet(false)} className="text-xs font-bold text-gray-400">Hide properties</button></div>
              <div className="p-3" onFocusCapture={() => setSheet(true)}>
                <Properties style={live} selection={selection} boxes={boxes} cardW={canvasW} onChange={change} />
              </div>
            </aside>
          </div>
          {!sheet && <button type="button" onClick={() => setSheet(true)} className="lg:hidden fixed bottom-3 right-3 z-10 px-4 py-2 tcg-btn rounded-full text-sm shadow-xl">Properties</button>}
        </div>
      )}
    </div>
  );
}

'use client';
import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { PROFILE_PRESETS, PROFILE_SPAN_CLASS, PROFILE_WIDGETS, PROFILE_WIDGET_TYPES, type ProfilePlacement, type ProfileSpan, type ProfileWidgetType } from '@/lib/profile-widgets';
import { resetProfileLayoutAction, saveProfileLayoutAction } from './actions';

type DragSource = { type: ProfileWidgetType; fromLibrary: boolean };
type DropAt = { type: ProfileWidgetType; after: boolean } | 'end' | null;

const btn = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50';
const ghost = `${btn} border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white`;

/**
 * The profile Overview. Visitors just see the widgets in the owner's order and widths. The owner gets "Customize profile":
 * drag a widget to move it, drag its right edge (or use the arrows) to resize, remove it, add from the library, then Save.
 * `nodes` are server-rendered for every widget when the owner is looking (so an added widget shows its real content straight away).
 */
export function ProfileGrid({ layout, nodes, isOwner }: { layout: ProfilePlacement[]; nodes: Partial<Record<ProfileWidgetType, ReactNode>>; isOwner: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(layout);
  const [draft, setDraft] = useState(layout);
  const [edit, setEdit] = useState(false);
  const [drag, setDrag] = useState<DragSource | null>(null);
  const [drop, setDrop] = useState<DropAt>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSaved(layout); if (!edit) setDraft(layout); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [layout]);
  const shown = edit ? draft : saved;
  const unused = useMemo(() => PROFILE_WIDGET_TYPES.filter(t => !draft.some(w => w.type === t)), [draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const move = (type: ProfileWidgetType, to: number) => setDraft(d => {
    const from = d.findIndex(w => w.type === type);
    if (from < 0) return d;
    const next = d.slice();
    const [item] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
    return next;
  });
  const insert = (type: ProfileWidgetType, at: number) => setDraft(d => (d.some(w => w.type === type) ? d : [...d.slice(0, at), { type, span: PROFILE_WIDGETS[type].defaultSpan }, ...d.slice(at)]));
  const applyPreset = (id: string) => { const p = PROFILE_PRESETS.find(x => x.id === id); if (p) setDraft(p.layout.map(w => ({ ...w }))); };
  const remove = (type: ProfileWidgetType) => setDraft(d => d.filter(w => w.type !== type));
  const widen = (w: ProfilePlacement, dir: 1 | -1) => {
    const spans = PROFILE_WIDGETS[w.type].spans;
    const next = spans[Math.max(0, Math.min(spans.length - 1, spans.indexOf(w.span) + dir))];
    if (next !== w.span) setDraft(d => d.map(x => (x.type === w.type ? { ...x, span: next } : x)));
  };

  function dropOn(target: DropAt) {
    if (!drag || !target) return;
    if (target === 'end') {
      if (drag.fromLibrary) insert(drag.type, draft.length); else move(drag.type, draft.length);
    } else if (target.type !== drag.type) {
      const base = draft.findIndex(w => w.type === target.type) + (target.after ? 1 : 0);
      if (drag.fromLibrary) insert(drag.type, base);
      else { const from = draft.findIndex(w => w.type === drag.type); move(drag.type, from < base ? base - 1 : base); }
    }
    setDrag(null); setDrop(null);
  }
  function overWidget(e: DragEvent, w: ProfilePlacement) {
    if (!drag) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = w.span === 12 ? e.clientY > rect.top + rect.height / 2 : e.clientX > rect.left + rect.width / 2;
    setDrop(prev => (prev && prev !== 'end' && prev.type === w.type && prev.after === after ? prev : { type: w.type, after }));
  }

  function run(fn: () => Promise<ProfilePlacement[]>, failure: string) {
    setError('');
    startTransition(async () => {
      try {
        const next = await fn();
        setSaved(next); setDraft(next); setEdit(false);
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : failure); }
    });
  }
  const save = () => run(() => saveProfileLayoutAction(draft), 'Could not save your profile.');
  const reset = () => run(() => resetProfileLayoutAction(), 'Could not reset your profile.');
  const cancel = () => { setDraft(saved); setEdit(false); setError(''); setDrag(null); setDrop(null); };

  // Drag the right edge to resize: the span snaps to the nearest width the widget allows.
  function startResize(e: React.PointerEvent<HTMLElement>, w: ProfilePlacement) {
    e.preventDefault(); e.stopPropagation();
    const card = (e.currentTarget as HTMLElement).closest<HTMLElement>('.pg-item');
    const grid = gridRef.current;
    if (!card || !grid) return;
    card.draggable = false;
    const colWidth = grid.getBoundingClientRect().width / 12;
    const startX = e.clientX;
    const allowed = PROFILE_WIDGETS[w.type].spans;
    const handle = e.currentTarget as HTMLElement;
    try { handle.setPointerCapture(e.pointerId); } catch { /* the listeners below still work */ }
    const onMove = (ev: PointerEvent) => {
      const wanted = w.span + (ev.clientX - startX) / colWidth;
      const next = allowed.reduce((best, s) => (Math.abs(s - wanted) < Math.abs(best - wanted) ? s : best), allowed[0]);
      setDraft(d => (d.find(x => x.type === w.type)?.span === next ? d : d.map(x => (x.type === w.type ? { ...x, span: next as ProfileSpan } : x))));
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove); handle.removeEventListener('pointerup', onUp); handle.removeEventListener('pointercancel', onUp);
      card.draggable = true;
    };
    handle.addEventListener('pointermove', onMove); handle.addEventListener('pointerup', onUp); handle.addEventListener('pointercancel', onUp);
  }

  return (
    <div className="space-y-4">
      {isOwner && (!edit ? (
        <div className="flex justify-end">
          <button type="button" onClick={() => { setDraft(saved); setEdit(true); }} className={ghost}><Icon name="pencil" className="mr-1" />Customize profile</button>
        </div>
      ) : (
        <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 rounded-xl border border-yellow-500/40 bg-gray-900/95 backdrop-blur-sm px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
          <div className="min-w-0 mr-auto">
            <p className="text-sm font-bold text-yellow-300">Editing your profile</p>
            <p className="text-xs text-gray-500">Drag widgets to rearrange, drag a right edge or use the arrows to resize, the cross removes one. Add widgets from the list below.</p>
          </div>
          <select value="" onChange={e => applyPreset(e.target.value)} disabled={pending} aria-label="Start from a preset layout" className="select select-sm w-fit max-w-full">
            <option value="">Start from a preset...</option>
            {PROFILE_PRESETS.map(p => <option key={p.id} value={p.id} title={p.description}>{p.label}</option>)}
          </select>
          <button type="button" onClick={reset} disabled={pending} className={`${ghost} hover:border-red-400/60 hover:text-red-300`}>Reset to default</button>
          <button type="button" onClick={cancel} disabled={pending} className={ghost}>Cancel</button>
          <button type="button" onClick={save} disabled={pending || !dirty} className={`${btn} border-yellow-500 bg-yellow-500 text-gray-950 hover:bg-yellow-400`}>{pending ? 'Saving…' : 'Save profile'}</button>
        </div>
      ))}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      {edit && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4">
          {unused.length === 0 ? <p className="text-sm text-gray-500">Every widget is already on your profile.</p> : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {unused.map(t => {
                const def = PROFILE_WIDGETS[t];
                return (
                  <li key={t} draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', t); setDrag({ type: t, fromLibrary: true }); }} onDragEnd={() => { setDrag(null); setDrop(null); }}
                    className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-950/50 hover:border-yellow-500/40 p-3 cursor-grab active:cursor-grabbing">
                    <Icon name={def.icon} className="w-5 h-5 text-yellow-500/90 mt-0.5" />
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-gray-200">{def.title}</span><span className="block text-xs text-gray-500">{def.description}</span></span>
                    <button type="button" onClick={() => insert(t, draft.length)} className={`${ghost} shrink-0`} aria-label={`Add ${def.title}`}>+ Add</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div ref={gridRef} className="grid grid-cols-12 gap-4 items-stretch">
        {shown.map((w, idx) => {
          const def = PROFILE_WIDGETS[w.type];
          const node = nodes[w.type];
          const wrapper = `col-span-12 ${PROFILE_SPAN_CLASS[w.span]} min-w-0 relative`;
          if (!edit) return node ? <div key={w.type} className={wrapper}>{node}</div> : null;
          const target = drop && drop !== 'end' && drop.type === w.type ? drop : null;
          const dragging = drag?.type === w.type && !drag.fromLibrary;
          return (
            <div key={w.type} draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', w.type); setDrag({ type: w.type, fromLibrary: false }); }} onDragEnd={() => { setDrag(null); setDrop(null); }}
              onDragOver={e => overWidget(e, w)} onDrop={e => { e.preventDefault(); dropOn(drop); }}
              className={`${wrapper} pg-item rounded-2xl pt-9 outline-solid outline-2 outline-dashed transition-[outline-color,opacity] duration-200 ${dragging ? 'outline-yellow-500/70 opacity-40' : target ? 'outline-yellow-500' : 'outline-gray-700'} ${target ? (target.after ? 'shadow-[inset_-6px_0_0_0_#eab308]' : 'shadow-[inset_6px_0_0_0_#eab308]') : ''}`}>
              <div className="absolute top-1.5 right-2 z-10 flex items-center gap-1 rounded-lg bg-gray-950/90 border border-gray-700 px-1.5 py-1 shadow-lg">
                <span className="px-1 text-gray-500 cursor-grab" title="Drag to move" aria-hidden><Icon name="grip" className="w-4 h-4" /></span>
                <span className="text-[11px] font-bold text-gray-300 px-1 max-w-32 truncate">{def.title}</span>
                <button type="button" onClick={() => move(w.type, idx - 1)} disabled={idx === 0} className="w-6 h-6 rounded-sm text-gray-300 hover:bg-white/10 disabled:opacity-30" aria-label={`Move ${def.title} earlier`}><Icon name="chevronUp" className="w-4 h-4" /></button>
                <button type="button" onClick={() => move(w.type, idx + 1)} disabled={idx === shown.length - 1} className="w-6 h-6 rounded-sm text-gray-300 hover:bg-white/10 disabled:opacity-30" aria-label={`Move ${def.title} later`}><Icon name="chevronDown" className="w-4 h-4" /></button>
                <button type="button" onClick={() => widen(w, -1)} disabled={w.span === def.spans[0]} className="w-6 h-6 rounded-sm text-gray-300 hover:bg-white/10 disabled:opacity-30" aria-label={`Make ${def.title} narrower`}><Icon name="chevronLeft" className="w-4 h-4" /></button>
                <span className="text-[10px] text-gray-500 tabular-nums w-7 text-center" title="Width in twelfths of the page">{w.span}/12</span>
                <button type="button" onClick={() => widen(w, 1)} disabled={w.span === def.spans[def.spans.length - 1]} className="w-6 h-6 rounded-sm text-gray-300 hover:bg-white/10 disabled:opacity-30" aria-label={`Make ${def.title} wider`}><Icon name="chevronRight" className="w-4 h-4" /></button>
                <button type="button" onClick={() => remove(w.type)} className="w-6 h-6 rounded-sm text-red-300 hover:bg-red-500/20" aria-label={`Remove ${def.title}`}><Icon name="x" className="w-4 h-4" /></button>
              </div>
              <div role="separator" aria-orientation="vertical" aria-label={`Resize ${def.title}`} title="Drag to resize" onPointerDown={e => startResize(e, w)}
                className="absolute z-10 top-1/2 -right-2 -translate-y-1/2 w-4 h-20 flex items-center justify-center cursor-ew-resize touch-none group">
                <span className="w-1.5 h-12 rounded-full bg-gray-600 group-hover:bg-yellow-500 transition-colors" />
              </div>
              <div className="pointer-events-none select-none h-full">{node}</div>
            </div>
          );
        })}
        {edit && (
          <div className={`col-span-12 rounded-2xl border-2 border-dashed px-4 py-6 text-center text-sm ${drop === 'end' ? 'border-yellow-500 text-yellow-300 bg-yellow-500/5' : 'border-gray-800 text-gray-600'}`}
            onDragOver={e => { if (drag) { e.preventDefault(); setDrop('end'); } }} onDrop={e => { e.preventDefault(); dropOn('end'); }}>
            {shown.length === 0 ? 'Your profile is empty. Drag a widget here, or add one above.' : 'Drop here to place at the end'}
          </div>
        )}
        {!edit && shown.length === 0 && <p className="col-span-12 rind rounded-2xl p-8 text-center text-sm text-gray-400">{isOwner ? 'Your Overview is empty. Use Customize profile to add widgets.' : 'Nothing to show here yet.'}</p>}
      </div>
    </div>
  );
}

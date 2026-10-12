'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type DragEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_LAYOUT, SPAN_CLASS, WIDGETS, WIDGET_TYPES, type DashboardLayout, type Span, type WidgetPlacement, type WidgetType } from '@/lib/dashboard';
import { Spinner } from '../components/PendingButton';
import { resetDashboardLayoutAction, saveDashboardLayoutAction } from './actions';

type DragSource = { type: WidgetType; fromLibrary: boolean };
type DropAt = { type: WidgetType; after: boolean } | 'end' | null;

const btn = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50';
const ghost = `${btn} border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white`;

function reduceMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The dashboard's widget grid. In view mode it lays the widgets out in the saved order and widths. "Customize" turns on edit mode:
 * drag a widget (or one from the library) to move it, change its width, move it earlier / later with the arrow buttons (the
 * keyboard / touch route), remove it, add from the library, then Save (stored for the whole admin) or Cancel.
 * `nodes` are the server-rendered widgets, only for the widgets in the saved layout; a widget added in edit mode shows a
 * placeholder until it is saved.
 */
export function DashboardGrid({ layout, nodes }: { layout: DashboardLayout; nodes: Partial<Record<WidgetType, ReactNode>> }) {
  const router = useRouter();
  const [saved, setSaved] = useState(layout);
  const [draft, setDraft] = useState<WidgetPlacement[]>(layout.widgets);
  const [edit, setEdit] = useState(false);
  const [drag, setDrag] = useState<DragSource | null>(null);
  const [drop, setDrop] = useState<DropAt>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const [libraryOpen, setLibraryOpen] = useState(true);
  // Little animations: a widget that was just moved / resized / added gets a short "settle" or "pop", and one being removed fades out first.
  const [fx, setFx] = useState<{ type: WidgetType; kind: 'settle' | 'pop' } | null>(null);
  const [leaving, setLeaving] = useState<WidgetType | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<WidgetType, HTMLElement>());
  const lastPos = useRef(new Map<WidgetType, { x: number; y: number }>());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = (type: WidgetType, kind: 'settle' | 'pop') => {
    setFx({ type, kind });
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFx(null), 700);
  };
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // A refresh brings the saved layout (and any newly needed widget nodes).
  useEffect(() => { setSaved(layout); if (!edit) setDraft(layout.widgets); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [layout]);

  const shown = edit ? draft : saved.widgets;
  const unused = useMemo(() => WIDGET_TYPES.filter(t => !draft.some(w => w.type === t)), [draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.widgets);

  const move = (type: WidgetType, to: number) => { flash(type, 'settle'); setDraft(d => {
    const from = d.findIndex(w => w.type === type);
    if (from < 0) return d;
    const next = d.slice();
    const [item] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
    return next;
  }); };
  const insert = (type: WidgetType, at: number) => { flash(type, 'pop'); setDraft(d => (d.some(w => w.type === type) ? d : [...d.slice(0, at), { type, span: WIDGETS[type].defaultSpan }, ...d.slice(at)])); };
  const remove = (type: WidgetType) => {
    // Fade it out first, then take it away (straight away when motion is reduced).
    if (reduceMotion()) { setDraft(d => d.filter(w => w.type !== type)); return; }
    setLeaving(type);
    setTimeout(() => { setDraft(d => d.filter(w => w.type !== type)); setLeaving(null); }, 200);
  };
  const setSpan = (type: WidgetType, span: Span) => { flash(type, 'settle'); setDraft(d => d.map(w => (w.type === type ? { ...w, span } : w))); };
  const step = (type: WidgetType, delta: number) => { const i = draft.findIndex(w => w.type === type); move(type, i + delta); };
  const widen = (w: WidgetPlacement, dir: 1 | -1) => {
    const spans = WIDGETS[w.type].spans;
    const i = spans.indexOf(w.span);
    const next = spans[Math.max(0, Math.min(spans.length - 1, i + dir))];
    if (next !== w.span) setSpan(w.type, next);
  };

  // FLIP: after every layout change, widgets that ended up somewhere else glide from where they were instead of jumping.
  const signature = shown.map(w => `${w.type}:${w.span}`).join(',') + (edit ? ':e' : '');
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const origin = grid.getBoundingClientRect();
    const next = new Map<WidgetType, { x: number; y: number }>();
    els.current.forEach((el, type) => {
      const r = el.getBoundingClientRect();
      const pos = { x: r.left - origin.left, y: r.top - origin.top };
      next.set(type, pos);
      const prev = lastPos.current.get(type);
      if (!prev || reduceMotion()) return;
      const dx = prev.x - pos.x;
      const dy = prev.y - pos.y;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    lastPos.current = next;
  }, [signature]);

  function dropOn(target: DropAt) {
    if (!drag || !target) return;
    if (target === 'end') {
      if (drag.fromLibrary) insert(drag.type, draft.length); else move(drag.type, draft.length);
    } else if (target.type !== drag.type) {
      const base = draft.findIndex(w => w.type === target.type) + (target.after ? 1 : 0);
      if (drag.fromLibrary) insert(drag.type, base);
      else {
        // Removing the dragged item first shifts everything after it up by one.
        const from = draft.findIndex(w => w.type === drag.type);
        move(drag.type, from < base ? base - 1 : base);
      }
    }
    setDrag(null);
    setDrop(null);
  }

  function overWidget(e: DragEvent, w: WidgetPlacement) {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = drag.fromLibrary ? 'copy' : 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = w.span === 12 ? e.clientY > rect.top + rect.height / 2 : e.clientX > rect.left + rect.width / 2;
    setDrop(prev => (prev && prev !== 'end' && prev.type === w.type && prev.after === after ? prev : { type: w.type, after }));
  }

  function save() {
    setError('');
    startTransition(async () => {
      try {
        const res = await saveDashboardLayoutAction({ widgets: draft });
        setSaved(res.layout);
        setDraft(res.layout.widgets);
        setEdit(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the dashboard');
      }
    });
  }
  function reset() {
    setError('');
    startTransition(async () => {
      try {
        await resetDashboardLayoutAction();
        setSaved(DEFAULT_LAYOUT);
        setDraft(DEFAULT_LAYOUT.widgets);
        setEdit(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reset the dashboard');
      }
    });
  }
  function cancel() { setDraft(saved.widgets); setEdit(false); setError(''); setDrag(null); setDrop(null); }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {!edit ? (
        <div className="flex justify-end">
          <button type="button" onClick={() => { setDraft(saved.widgets); setEdit(true); }} className={ghost}>✏️ Customize dashboard</button>
        </div>
      ) : (
        <div className="dash-slide sticky top-0 z-20 rounded-xl border border-yellow-500/40 bg-gray-900/95 backdrop-blur px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
          <div className="min-w-0 mr-auto">
            <p className="text-sm font-bold text-yellow-300">Editing the dashboard</p>
            <p className="text-xs text-gray-500">Drag widgets to rearrange, use ◀ ▶ to resize, ↑ ↓ to move, ✕ to remove. Drag from the library to add.</p>
          </div>
          <button type="button" onClick={() => setLibraryOpen(o => !o)} className={ghost} aria-expanded={libraryOpen}>🧩 Widgets ({unused.length} to add)</button>
          <button type="button" onClick={reset} disabled={pending} className={`${ghost} hover:border-red-400/60 hover:text-red-300`}>Reset to default</button>
          <button type="button" onClick={cancel} disabled={pending} className={ghost}>Cancel</button>
          <button type="button" onClick={save} disabled={pending || !dirty} className={`${btn} border-yellow-500 bg-yellow-500 text-gray-950 hover:bg-yellow-400`}>{pending && <Spinner />}Save layout</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      {/* Widget library */}
      {edit && libraryOpen && (
        <div className="dash-slide rounded-xl border border-gray-800 bg-gray-900/70 p-4">
          {unused.length === 0 ? <p className="text-sm text-gray-500">Every widget is already on the dashboard.</p> : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {unused.map(t => {
                const def = WIDGETS[t];
                return (
                  <li
                    key={t}
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', t); setDrag({ type: t, fromLibrary: true }); }}
                    onDragEnd={() => { setDrag(null); setDrop(null); }}
                    className={`flex items-start gap-3 rounded-lg border bg-gray-950/50 hover:border-yellow-500/40 hover:-translate-y-0.5 hover:shadow-lg p-3 cursor-grab active:cursor-grabbing transition-all duration-150 ${drag?.type === t && drag.fromLibrary ? 'border-yellow-500/60 opacity-50 scale-[0.98]' : 'border-gray-800'}`}
                  >
                    <span className="text-xl leading-none" aria-hidden>{def.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-200">{def.title}</span>
                      <span className="block text-xs text-gray-500">{def.description}</span>
                    </span>
                    <button type="button" onClick={() => insert(t, draft.length)} className={`${ghost} shrink-0`} aria-label={`Add ${def.title}`}>+ Add</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* The grid */}
      <div ref={gridRef} className="grid grid-cols-12 gap-4 items-stretch">
        {shown.map((w, idx) => {
          const def = WIDGETS[w.type];
          const node = nodes[w.type];
          const target = drop && drop !== 'end' && drop.type === w.type ? drop : null;
          const wrapper = `col-span-12 ${SPAN_CLASS[w.span]} min-w-0 relative`;
          const mine = fx?.type === w.type ? fx.kind : null;
          const dragging = drag?.type === w.type && !drag.fromLibrary;
          if (!edit) return node ? <div key={w.type} ref={el => { if (el) els.current.set(w.type, el); else els.current.delete(w.type); }} className={wrapper}>{node}</div> : null;
          return (
            <div
              key={w.type}
              ref={el => { if (el) els.current.set(w.type, el); else els.current.delete(w.type); }}
              className={`${wrapper} dash-item rounded-2xl pt-9 outline outline-2 outline-dashed transition-[outline-color,box-shadow,opacity,scale] duration-200 ${dragging ? 'outline-yellow-500/70 opacity-40 scale-[0.97]' : target ? 'outline-yellow-500' : 'outline-gray-700'} ${target ? (target.after ? 'shadow-[inset_-6px_0_0_0_#eab308]' : 'shadow-[inset_6px_0_0_0_#eab308]') : ''} ${mine === 'pop' ? 'dash-pop' : mine === 'settle' ? 'dash-settle' : ''} ${leaving === w.type ? 'dash-leave' : ''}`}
              draggable
              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', w.type); setDrag({ type: w.type, fromLibrary: false }); }}
              onDragEnd={() => { setDrag(null); setDrop(null); }}
              onDragOver={e => overWidget(e, w)}
              onDrop={e => { e.preventDefault(); dropOn(drop); }}
            >
              {/* Edit controls */}
              <div className="absolute top-1.5 right-2 z-10 flex items-center gap-1 rounded-lg bg-gray-950/90 border border-gray-700 px-1.5 py-1 shadow-lg">
                <span className="px-1 text-gray-500 cursor-grab text-sm select-none" title="Drag to move" aria-hidden>⠿</span>
                <span className="text-[11px] font-bold text-gray-300 px-1 max-w-[9rem] truncate">{def.title}</span>
                <button type="button" onClick={() => step(w.type, -1)} disabled={idx === 0} className="w-6 h-6 rounded text-gray-300 hover:bg-white/10 disabled:opacity-30" aria-label={`Move ${def.title} earlier`}>↑</button>
                <button type="button" onClick={() => step(w.type, 1)} disabled={idx === shown.length - 1} className="w-6 h-6 rounded text-gray-300 hover:bg-white/10 disabled:opacity-30" aria-label={`Move ${def.title} later`}>↓</button>
                <button type="button" onClick={() => widen(w, -1)} disabled={w.span === def.spans[0]} className="w-6 h-6 rounded text-gray-300 hover:bg-white/10 disabled:opacity-30" aria-label={`Make ${def.title} narrower`}>◀</button>
                <span className="text-[10px] text-gray-500 tabular-nums w-7 text-center" title="Width in twelfths of the page">{w.span}/12</span>
                <button type="button" onClick={() => widen(w, 1)} disabled={w.span === def.spans[def.spans.length - 1]} className="w-6 h-6 rounded text-gray-300 hover:bg-white/10 disabled:opacity-30" aria-label={`Make ${def.title} wider`}>▶</button>
                <button type="button" onClick={() => remove(w.type)} className="w-6 h-6 rounded text-red-300 hover:bg-red-500/20" aria-label={`Remove ${def.title}`}>✕</button>
              </div>
              {/* Content, inert while editing so a click or drag never triggers the widget itself */}
              <div className="pointer-events-none select-none h-full">
                {node ?? (
                  <div className="tcg-panel rounded-2xl h-full min-h-40 p-6 flex flex-col items-center justify-center text-center gap-1.5">
                    <span className="text-3xl" aria-hidden>{def.icon}</span>
                    <p className="font-semibold text-white">{def.title}</p>
                    <p className="text-xs text-gray-500 max-w-xs">{def.description}</p>
                    <p className="text-[11px] text-yellow-500/80 mt-1">Its data appears once you save the layout.</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {edit && (
          <div
            className={`col-span-12 rounded-2xl border-2 border-dashed px-4 py-6 text-center text-sm transition-all duration-200 ${drop === 'end' ? 'border-yellow-500 text-yellow-300 bg-yellow-500/5' : 'border-gray-800 text-gray-600'}`}
            onDragOver={e => { if (drag) { e.preventDefault(); setDrop('end'); } }}
            onDrop={e => { e.preventDefault(); dropOn('end'); }}
          >
            {shown.length === 0 ? 'The dashboard is empty. Drag a widget here, or add one from the library.' : 'Drop here to place at the end'}
          </div>
        )}
      </div>
    </div>
  );
}

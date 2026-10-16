'use client';
import { Icon } from '@/app/components/Icon';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type DragEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_LAYOUT, SPAN_CLASS, WIDGETS, WIDGET_TYPES, type DashboardLayout, type Span, type WidgetPlacement, type WidgetType } from '@/lib/dashboard';
import { Spinner } from '../components/PendingButton';
import { applyDashboardPresetAction, deleteDashboardPresetAction, saveDashboardLayoutAction, saveDashboardPresetAction } from './actions';

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
export function DashboardGrid({ layout, nodes, presets: initialPresets }: { layout: DashboardLayout; nodes: Partial<Record<WidgetType, ReactNode>>; presets: { name: string; by?: string }[] }) {
  const router = useRouter();
  const [presets, setPresets] = useState(initialPresets);
  const [presetName, setPresetName] = useState('');
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null); // a preset waiting for its second click
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
  // Only changes the draft: nothing is stored until Save, and Cancel brings the saved layout back.
  function reset() { setError(''); setDraft(DEFAULT_LAYOUT.widgets); }
  // Esc leaves edit mode like Cancel (nothing is saved).
  useEffect(() => {
    if (!edit) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) cancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, saved]);
  function cancel() { setDraft(saved.widgets); setEdit(false); setError(''); setDrag(null); setDrop(null); }

  // Presets: named layouts. Applying one makes it the saved layout straight away.
  // Applying replaces the saved layout at once, so it takes a second click (relaxes after 4 seconds).
  function askApply(name: string) {
    if (armed !== name) { setArmed(name); setTimeout(() => setArmed(a => (a === name ? null : a)), 4000); return; }
    setArmed(null);
    applyPreset(name);
  }
  function applyPreset(name: string) {
    setError('');
    startTransition(async () => {
      try {
        const next = await applyDashboardPresetAction(name);
        setSaved({ widgets: next.widgets });
        setDraft(next.widgets);
        setActivePreset(name);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not apply that preset');
      }
    });
  }
  function savePreset() {
    const name = presetName.trim();
    if (!name) return;
    setError('');
    startTransition(async () => {
      try {
        const list = await saveDashboardPresetAction(name, { widgets: draft });
        setPresets(list);
        setActivePreset(name);
        setPresetName('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the preset');
      }
    });
  }
  function removePreset(name: string) {
    startTransition(async () => {
      try {
        const list = await deleteDashboardPresetAction(name);
        setPresets(list);
        if (activePreset === name) setActivePreset(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete the preset');
      }
    });
  }

  // Drag the right edge of a widget to resize it: the span snaps to the nearest width the widget allows.
  function startResize(e: React.PointerEvent<HTMLElement>, w: WidgetPlacement) {
    e.preventDefault();
    e.stopPropagation();
    const card = (e.currentTarget as HTMLElement).closest<HTMLElement>('.dash-item');
    const grid = gridRef.current;
    if (!card || !grid) return;
    card.draggable = false; // don't let the browser start a drag of the whole widget
    const colWidth = grid.getBoundingClientRect().width / 12;
    const startX = e.clientX;
    const allowed = WIDGETS[w.type].spans;
    const handle = e.currentTarget as HTMLElement;
    try { handle.setPointerCapture(e.pointerId); } catch { /* synthetic or already released pointer: the listeners below still work */ }
    const onMove = (ev: PointerEvent) => {
      const wanted = w.span + (ev.clientX - startX) / colWidth;
      const next = allowed.reduce((best, s) => (Math.abs(s - wanted) < Math.abs(best - wanted) ? s : best), allowed[0]);
      setDraft(d => (d.find(x => x.type === w.type)?.span === next ? d : d.map(x => (x.type === w.type ? { ...x, span: next } : x))));
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      card.draggable = true;
      flash(w.type, 'settle');
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {!edit ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {presets.length > 0 && (
            <div role="group" aria-label="Dashboard presets" className="flex flex-wrap items-center gap-1.5 mr-auto">
              <span className="text-[11px] uppercase tracking-wider font-bold text-gray-600 mr-1">Team layouts</span>
              {presets.map(({ name, by }) => (
                <button key={name} type="button" title={by ? `Saved by ${by}` : undefined} disabled={pending} onClick={() => askApply(name)} aria-pressed={activePreset === name} className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors disabled:opacity-50 ${activePreset === name ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`}>{armed === name ? `Apply ${name}?` : name}</button>
              ))}
            </div>
          )}
          {pending && <Spinner />}
          <button type="button" onClick={() => { setDraft(saved.widgets); setEdit(true); }} className={ghost}><Icon name="pencil" className="mr-1" />Customize dashboard</button>
        </div>
      ) : (
        <div className="dash-slide sticky top-0 z-20 rounded-xl border border-yellow-500/40 bg-gray-900/95 backdrop-blur px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
          <div className="min-w-0 mr-auto">
            <p className="text-sm font-bold text-yellow-300">Editing the dashboard</p>
            <p className="text-xs text-gray-500">Drag widgets to rearrange, use the arrow buttons to resize and move, the cross to remove. Drag from the library to add.</p>
          </div>
          <button type="button" onClick={() => setLibraryOpen(o => !o)} className={ghost} aria-expanded={libraryOpen}><Icon name="puzzle" className="mr-1" />Widgets ({unused.length} to add)</button>
          <button type="button" onClick={reset} disabled={pending} title="Puts the default layout in the draft; nothing is saved until you press Save layout" className={ghost}>Reset to default</button>
          <button type="button" onClick={cancel} disabled={pending} className={ghost}>Cancel</button>
          <button type="button" onClick={save} disabled={pending || !dirty} className={`${btn} border-yellow-500 bg-yellow-500 text-gray-950 hover:bg-yellow-400`}>{pending && <Spinner />}Save layout</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      {/* Presets */}
      {edit && (
        <div className="dash-slide rounded-xl border border-gray-800 bg-gray-900/70 px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Team layouts</span>
          <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); savePreset(); }}>
            <input value={presetName} onChange={e => setPresetName(e.target.value)} maxLength={30} placeholder="Name this layout (e.g. Stream day)" aria-label="Layout name" className="w-64 rounded-lg bg-gray-950 border border-gray-700 px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500" />
            <button type="submit" disabled={pending || !presetName.trim()} className={ghost}>Share as team layout</button>
          </form>
          {presets.length === 0 ? <span className="text-xs text-gray-600">No team layouts yet. Arrange your dashboard, name it, and anyone on staff can switch to it. Your own layout is saved just for you.</span> : (
            <ul className="flex flex-wrap items-center gap-1.5">
              {presets.map(({ name, by }) => (
                <li key={name} className="flex items-center rounded-full border border-gray-700 overflow-hidden">
                  <button type="button" disabled={pending} onClick={() => askApply(name)} className="px-2.5 py-1 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/5" title={`Use this layout (replaces yours)${by ? `. Saved by ${by}` : ''}`}>{armed === name ? `Apply ${name}?` : name}{by ? <span className="ml-1.5 font-normal text-gray-500">{by}</span> : null}</button>
                  <button type="button" disabled={pending} onClick={() => removePreset(name)} className="px-1.5 py-1 text-gray-500 hover:text-red-300 hover:bg-red-500/10" aria-label={`Delete preset ${name}`}><Icon name="x" className="w-3 h-3" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
                    <Icon name={def.icon} className="w-5 h-5 text-yellow-500/90" />
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
                <span className="px-1 text-gray-500 cursor-grab text-sm select-none" title="Drag to move" aria-hidden><Icon name="grip" className="w-4 h-4" /></span>
                <span className="text-[11px] font-bold text-gray-300 px-1 max-w-[9rem] truncate">{def.title}</span>
                <button type="button" onClick={() => step(w.type, -1)} disabled={idx === 0} className="w-6 h-6 rounded text-gray-300 hover:bg-white/10 disabled:opacity-30" aria-label={`Move ${def.title} earlier`}><Icon name="chevronUp" className="w-4 h-4" /></button>
                <button type="button" onClick={() => step(w.type, 1)} disabled={idx === shown.length - 1} className="w-6 h-6 rounded text-gray-300 hover:bg-white/10 disabled:opacity-30" aria-label={`Move ${def.title} later`}><Icon name="chevronDown" className="w-4 h-4" /></button>
                <button type="button" onClick={() => widen(w, -1)} disabled={w.span === def.spans[0]} className="w-6 h-6 rounded text-gray-300 hover:bg-white/10 disabled:opacity-30" aria-label={`Make ${def.title} narrower`}><Icon name="chevronLeft" className="w-4 h-4" /></button>
                <span className="text-[10px] text-gray-500 tabular-nums w-7 text-center" title="Width in twelfths of the page">{w.span}/12</span>
                <button type="button" onClick={() => widen(w, 1)} disabled={w.span === def.spans[def.spans.length - 1]} className="w-6 h-6 rounded text-gray-300 hover:bg-white/10 disabled:opacity-30" aria-label={`Make ${def.title} wider`}><Icon name="chevronRight" className="w-4 h-4" /></button>
                <button type="button" onClick={() => remove(w.type)} className="w-6 h-6 rounded text-red-300 hover:bg-red-500/20" aria-label={`Remove ${def.title}`}><Icon name="x" className="w-4 h-4" /></button>
              </div>
              {/* Resize handle: drag the right edge */}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize ${def.title}`}
                title="Drag to resize"
                onPointerDown={e => startResize(e, w)}
                className="absolute z-10 top-1/2 -right-2 -translate-y-1/2 w-4 h-20 flex items-center justify-center cursor-ew-resize touch-none group"
              >
                <span className="w-1.5 h-12 rounded-full bg-gray-600 group-hover:bg-yellow-500 transition-colors" />
              </div>
              {/* Content, inert while editing so a click or drag never triggers the widget itself */}
              <div className="pointer-events-none select-none h-full">
                {node ?? (
                  <div className="tcg-panel rounded-2xl h-full min-h-40 p-6 flex flex-col items-center justify-center text-center gap-1.5">
                    <Icon name={def.icon} className="w-8 h-8 text-yellow-500/90" />
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

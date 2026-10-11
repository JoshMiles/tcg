'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PROPS, PROP_BY_KEY, PROP_GROUPS, REVEAL_STYLES, SECTION_ORDER, VARIANT_IDS, cleanValue, exportProps, importProps,
  type PropDef, type PropValue, type PropValues, type VariantId,
} from '@/lib/overlay-props';
import { DEFAULT_LAYOUT, DEFAULT_PLACEMENT, LAYOUT_PRESETS, sanitizeLayout, type OverlayLayout, type Placement } from '@/lib/overlay-layout';

// The Overlay Editor: one Photoshop-style workspace for where the overlay sits (Layout) and how it looks and moves. Everything is generated from the registry in
// lib/overlay-props.ts. Layout: an options bar (scope, presets, import/export, save) over a fixed canvas (the real overlay
// in an iframe, always fitted whole into the available space, never scrolling) and a docked properties panel (category
// rail, version tabs, collapsible sections, search). Values are stored sparsely; there are two scopes: Global and
// per-pack overrides. The preview is /overlay.html?preview fed the unsaved values by postMessage.

interface PackInfo { id: string; name: string }
interface PresetInfo { id: string; name: string; props: PropValues; updatedAt: number }
type Mode = 'pack' | 'collection';

const VERSION_LABELS: Record<VariantId, string> = { regular: 'Regular', reverse: 'Reverse Holo', full: 'Full Art', shiny: '✨ Shiny' };

const canon = (v: PropValues) => JSON.stringify(Object.keys(v).sort().map(k => [k, v[k]]));
const eq = (a: PropValue | undefined, b: PropValue | undefined) => JSON.stringify(a) === JSON.stringify(b);
const sectionRank = (s: string) => { const i = SECTION_ORDER.indexOf(s); return i < 0 ? 99 : i; };

// Which other property switches a property's controls on or off (so the panel can grey out what has no effect).
function dependsOn(key: string): { key: string; when: (v: PropValue) => boolean } | null {
  const m = key.match(/^(variant\.[a-z]+)\.(.+)$/);
  if (m) {
    const [, g, name] = m;
    if (/^glow(ColorA|ColorB|Blur|Spread|Speed)$/.test(name)) return { key: `${g}.glow`, when: v => v === true };
    if (/^pop(Scale|Tilt)$/.test(name)) return { key: `${g}.pop`, when: v => v === true };
    if (/^tilt(Axis|Amount|Speed|Perspective)$/.test(name)) return { key: `${g}.tilt`, when: v => v === true };
    if (/^rock(Amount|Speed)$/.test(name)) return { key: `${g}.rock`, when: v => v === true };
    if (/^sparkle(Count|Color)$/.test(name)) return { key: `${g}.sparkles`, when: v => v === true };
    if (/^holo(Colors|Opacity|Speed|Angle|Blend|Loop)$/.test(name)) return { key: `${g}.holoMode`, when: v => v !== 'off' };
  }
  if (key === 'reveal.burstOpacity') return { key: 'reveal.showBurst', when: v => v === true };
  if (key === 'reveal.gotText') return { key: 'reveal.showGotLine', when: v => v === true };
  if (key === 'collection.headingText') return { key: 'collection.showHeading', when: v => v === true };
  return null;
}

// "Layout" sits in the rail beside the registry's categories but isn't registry-driven: it edits the stage size and where each
// view is placed. Layout is global (not per pack), so it is hidden while editing a pack.
const LAYOUT_CAT = { id: 'layout', label: 'Layout', icon: '📐', description: 'Where the overlay sits on your OBS browser source.' };

type SidebarWindow = Window & { __tcgSidebarForce?: boolean };

export function OverlayEditor({
  initialGlobal, initialPacks, packs, presets, initialLayout, initialScope, saveAction, savePresetAction, deletePresetAction,
}: {
  initialGlobal: PropValues;
  initialPacks: Record<string, PropValues>;
  packs: PackInfo[];
  presets: PresetInfo[];
  initialLayout: OverlayLayout;
  initialScope: string;
  saveAction: (formData: FormData) => void | Promise<void>;
  savePresetAction: (formData: FormData) => void | Promise<void>;
  deletePresetAction: (formData: FormData) => void | Promise<void>;
}) {
  const [globalVals, setGlobalVals] = useState<PropValues>(initialGlobal);
  // Raw while typing (so a half-typed size isn't clamped under the cursor); `layout` is the sanitized copy that is previewed and saved.
  const [layoutVals, setLayoutVals] = useState<OverlayLayout>(initialLayout);
  const layout = useMemo(() => sanitizeLayout(layoutVals), [layoutVals]);
  const [packVals, setPackVals] = useState<Record<string, PropValues>>(initialPacks);
  const [scope, setScope] = useState<string>(initialScope === 'global' || packs.some(p => p.id === initialScope) ? initialScope : 'global');
  const [category, setCategory] = useState('reveal');
  const [version, setVersion] = useState<VariantId>('regular');   // the version being edited AND previewed
  const [mode, setMode] = useState<Mode>('pack');                  // which view the canvas shows
  const [query, setQuery] = useState('');
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [presetName, setPresetName] = useState('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [notice, setNotice] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const isPack = scope !== 'global';
  const current: PropValues = isPack ? packVals[scope] ?? {} : globalVals;

  // The admin sidebar collapses while this workspace is open (and is restored afterwards).
  useEffect(() => {
    const w = window as SidebarWindow;
    w.__tcgSidebarForce = true;
    window.dispatchEvent(new CustomEvent('tcg:sidebar', { detail: true }));
    return () => {
      w.__tcgSidebarForce = false;
      window.dispatchEvent(new CustomEvent('tcg:sidebar', { detail: false }));
    };
  }, []);

  // The value a row shows: its own, else (pack scope) the global value, else the default.
  const valueOf = useCallback((key: string): PropValue => {
    const def = PROP_BY_KEY[key];
    if (current[key] !== undefined) return current[key];
    if (isPack && globalVals[key] !== undefined) return globalVals[key];
    return def.default;
  }, [current, isPack, globalVals]);

  const setValue = (key: string, raw: unknown) => {
    const def = PROP_BY_KEY[key];
    const v = cleanValue(def, raw);
    if (v === undefined) return;
    if (!isPack) {
      setGlobalVals(g => {
        const next = { ...g };
        if (eq(v, def.default)) delete next[key]; else next[key] = v;
        return next;
      });
    } else {
      setPackVals(p => {
        const own = { ...(p[scope] ?? {}) };
        // Setting it back to what it would inherit anyway removes the override.
        const inherited = globalVals[key] !== undefined ? globalVals[key] : def.default;
        if (eq(v, inherited)) delete own[key]; else own[key] = v;
        return { ...p, [scope]: own };
      });
    }
  };
  const resetKeys = (keys: string[]) => {
    const drop = (m: PropValues) => { const n = { ...m }; keys.forEach(k => delete n[k]); return n; };
    if (!isPack) setGlobalVals(drop); else setPackVals(p => ({ ...p, [scope]: drop(p[scope] ?? {}) }));
  };
  const replaceCurrent = (next: PropValues) => {
    if (!isPack) setGlobalVals(next); else setPackVals(p => ({ ...p, [scope]: next }));
  };

  // What the editor would save: only the scopes that changed.
  const changedGlobal = canon(globalVals) !== canon(initialGlobal);
  const changedPacks = Object.keys({ ...initialPacks, ...packVals }).filter(id => canon(packVals[id] ?? {}) !== canon(initialPacks[id] ?? {}));
  const changedLayout = JSON.stringify(layout) !== JSON.stringify(initialLayout);
  const dirty = changedGlobal || changedPacks.length > 0 || changedLayout;
  const payload = JSON.stringify({
    ...(changedLayout ? { layout } : {}),
    ...(changedGlobal ? { global: globalVals } : {}),
    packs: Object.fromEntries(changedPacks.map(id => [id, packVals[id] ?? {}])),
  });
  const revert = () => { setGlobalVals(initialGlobal); setPackVals(initialPacks); setLayoutVals(initialLayout); };

  // The values that apply at this scope, sparse: what the preview shows and what export/presets capture.
  const effectiveSparse: PropValues = useMemo(() => (isPack ? { ...globalVals, ...(packVals[scope] ?? {}) } : globalVals), [isPack, globalVals, packVals, scope]);

  // ── What is listed ──
  const hiddenInScope = (d: PropDef) => isPack && d.view === 'collection'; // the collection view isn't per-pack
  const listView: Mode = isPack ? 'pack' : mode;
  const defsFor = (cat: string): PropDef[] => PROPS.filter(d => {
    if (d.group !== cat || hiddenInScope(d)) return false;
    if (cat === 'versions') return d.variant === version;
    if (cat === 'lists') return d.view === listView || d.view === 'both';
    return true;
  });
  const modifiedCount = (cat: string) => PROPS.filter(d => d.group === cat && !hiddenInScope(d) && current[d.key] !== undefined).length;
  const versionModified = (v: VariantId) => PROPS.some(d => d.variant === v && current[d.key] !== undefined);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const matches = (d: PropDef) => `${d.label} ${d.help ?? ''} ${d.section ?? ''} ${d.key}`.toLowerCase().includes(q);

  // Sections of the visible defs, in a sensible order.
  const groupSections = (defs: PropDef[]) => {
    const m = new Map<string, PropDef[]>();
    defs.forEach(d => m.set(d.section ?? '', [...(m.get(d.section ?? '') ?? []), d]));
    return [...m.entries()].sort((a, b) => sectionRank(a[0]) - sectionRank(b[0]));
  };

  // ── Preview plumbing ──
  const post = useCallback((message: object) => {
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const d = frameRef.current?.contentDocument;
    if (d && d.readyState === 'complete' && d.location.href !== 'about:blank') { setReady(true); setLoadedCount(c => c + 1); }
  }, []);

  const previewVariant = version === 'regular' ? '' : version;
  useEffect(() => { if (ready) post({ type: 'layout', layout }); }, [ready, loadedCount, layout, post]);
  useEffect(() => { if (ready) post({ type: 'variant', variant: previewVariant }); }, [ready, loadedCount, previewVariant, post]);
  useEffect(() => { if (ready) post({ type: 'props', props: effectiveSparse, packId: isPack ? scope : '' }); }, [ready, loadedCount, effectiveSparse, isPack, scope, post]);
  useEffect(() => { if (ready) post({ type: 'static', mode }); }, [ready, loadedCount, mode, post]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Fit the whole stage into the canvas area, both ways, so the preview never needs to scroll.
  const fit = box.w > 0 && box.h > 0 ? Math.min(box.w / layout.width, box.h / layout.height) : 0.3;
  const frameW = layout.width * fit, frameH = layout.height * fit;

  const play = () => {
    if (!ready || playing) return;
    setPlaying(true);
    post({ type: mode });
    setTimeout(() => setPlaying(false), mode === 'pack' ? 13000 : 9000);
  };

  // ── Presets, export, import ──
  const download = () => {
    const blob = new Blob([JSON.stringify(exportProps(effectiveSparse), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cheesy-overlay-${isPack ? packs.find(p => p.id === scope)?.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? 'pack' : 'global'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copyJson = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(exportProps(effectiveSparse), null, 2)); setNotice('Copied to the clipboard.'); }
    catch { setNotice('Could not copy. Use Download instead.'); }
  };
  const runImport = (text: string) => {
    try {
      const values = importProps(text);
      replaceCurrent(values);
      setImportError('');
      setImportText('');
      setNotice(`Imported ${Object.keys(values).length} setting${Object.keys(values).length === 1 ? '' : 's'}. Review, then Save.`);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not import that.');
    }
  };
  const applyPreset = (p: PresetInfo) => {
    replaceCurrent(isPack ? { ...(packVals[scope] ?? {}), ...p.props } : { ...p.props });
    setNotice(`Applied "${p.name}". Review, then Save.`);
  };

  // Copy every setting of one version onto the version being edited.
  const copyVersion = (from: VariantId) => {
    const next: PropValues = { ...current };
    for (const d of PROPS.filter(x => x.variant === version)) {
      const src = PROP_BY_KEY[d.key.replace(`variant.${version}.`, `variant.${from}.`)];
      if (!src) continue;
      const v = valueOf(src.key);
      // In global scope store sparsely; in pack scope store the value explicitly.
      if (!isPack && eq(v, d.default)) delete next[d.key]; else next[d.key] = v;
    }
    replaceCurrent(next);
    setNotice(`Copied the ${VERSION_LABELS[from]} look onto ${VERSION_LABELS[version]}. Review, then Save.`);
  };

  const btn = 'px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors';
  const ghost = `${btn} border border-gray-700 text-gray-200 hover:border-gray-500`;

  const renderRow = (def: PropDef) => {
    const dep = dependsOn(def.key);
    const off = dep ? !dep.when(valueOf(dep.key)) : false;
    return (
      <PropRow
        key={def.key}
        def={def}
        value={valueOf(def.key)}
        modified={current[def.key] !== undefined}
        inherited={isPack && current[def.key] === undefined && globalVals[def.key] !== undefined}
        isPack={isPack}
        off={off}
        onChange={v => setValue(def.key, v)}
        onReset={() => resetKeys([def.key])}
      />
    );
  };

  const renderSection = (scopeKey: string, name: string, defs: PropDef[], index: number) => {
    const k = `${scopeKey}/${name}`;
    const open = searching || (openMap[k] ?? index < 2);
    const changed = defs.filter(d => current[d.key] !== undefined);
    return (
      <section key={k} className="border-b border-gray-800/80 last:border-0">
        <div className="flex items-center gap-1 pr-2">
          <button
            type="button"
            onClick={() => setOpenMap(m => ({ ...m, [k]: !open }))}
            aria-expanded={open}
            className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5"
          >
            <span aria-hidden className={`text-[10px] text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
            <span className="text-sm font-semibold text-gray-200 truncate">{name || 'Settings'}</span>
            {changed.length > 0 && <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 rounded-full px-1.5">{changed.length}</span>}
          </button>
          {changed.length > 0 && (
            <button
              type="button"
              onClick={() => resetKeys(defs.map(d => d.key))}
              className="text-xs text-gray-500 hover:text-white px-1"
              title={isPack ? 'Clear the overrides in this section' : 'Reset this section to the defaults'}
            >
              {isPack ? 'inherit' : 'reset'}
            </button>
          )}
        </div>
        {open && <div className="px-3 pb-4 pt-1 space-y-4">{defs.map(renderRow)}</div>}
      </section>
    );
  };

  // ── Layout (stage size + where each view sits) ──
  const placement = layout[mode];
  const setSize = (patch: Partial<Pick<OverlayLayout, 'width' | 'height'>>) => setLayoutVals(l => ({ ...l, ...patch }));
  // `patch` may be a function of the latest placement, so rapid key presses never work from stale state.
  const setPlacement = (patch: Partial<Placement> | ((p: Placement) => Partial<Placement>)) =>
    setLayoutVals(l => ({ ...l, [mode]: { ...l[mode], ...(typeof patch === 'function' ? patch(l[mode]) : patch) } }));
  const moved = (p: Placement) => p.scale !== 1 || p.offsetX !== 0 || p.offsetY !== 0;
  const layoutMoved = (moved(layout.pack) ? 1 : 0) + (moved(layout.collection) ? 1 : 0) + (layout.width !== DEFAULT_LAYOUT.width || layout.height !== DEFAULT_LAYOUT.height ? 1 : 0);
  const layoutCat = category === 'layout' && !isPack;
  const rail = isPack ? PROP_GROUPS : [LAYOUT_CAT, ...PROP_GROUPS];
  const dragging = layoutCat && !query.trim();

  // Dragging the canvas (or the arrow keys) moves the view being edited. One screen pixel = 1/fit design pixels.
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: placement.offsetX, oy: placement.offsetY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setPlacement({ offsetX: Math.round(d.ox + (e.clientX - d.x) / fit), offsetY: Math.round(d.oy + (e.clientY - d.y) / fit) });
  };
  const onPointerUp = () => { drag.current = null; };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!dragging) return;
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    setPlacement(p => ({ offsetX: p.offsetX + m[0], offsetY: p.offsetY + m[1] }));
  };

  const cat = PROP_GROUPS.find(g => g.id === category) ?? PROP_GROUPS[0];
  const catDefs = defsFor(cat.id);
  const scopeKey = `${cat.id}${cat.id === 'versions' ? '.' + version : ''}${cat.id === 'lists' ? '.' + listView : ''}`;
  const catSections = groupSections(catDefs);

  // Search results span every category (and every version), labelled with where each one lives.
  const searchResults = searching
    ? PROP_GROUPS.flatMap(g => groupSections(PROPS.filter(d => d.group === g.id && !hiddenInScope(d) && matches(d)))
        .flatMap(([name, defs]) => defs.map(d => ({ d, crumb: `${g.label}${d.variant ? ' › ' + VERSION_LABELS[d.variant] : ''} › ${name}` }))))
    : [];

  const viewName = mode === 'pack' ? 'pack opening' : 'collection view';
  const layoutPanel = (
    <div className="p-3 space-y-5">
      <section className="space-y-2">
        <h4 className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Browser source size <span className="normal-case text-gray-600 font-normal">· shared by both views</span></h4>
        <p className="text-xs text-gray-400 leading-relaxed">
          Set the OBS browser source to <code className="text-yellow-400">{layout.width}</code> × <code className="text-yellow-400">{layout.height}</code>.
          The overlay is drawn at this size and scaled to fit if your source differs, so nothing gets cut off.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {LAYOUT_PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => setSize({ width: p.width, height: p.height })}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${layout.width === p.width && layout.height === p.height ? 'border-yellow-500 text-yellow-300' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <label className="text-xs text-gray-500 space-y-1">Width
            <input type="number" min={320} max={3840} value={layoutVals.width} onChange={e => setSize({ width: Number(e.target.value) })} className={`${inputCls} block w-24`} />
          </label>
          <label className="text-xs text-gray-500 space-y-1">Height
            <input type="number" min={240} max={2160} value={layoutVals.height} onChange={e => setSize({ height: Number(e.target.value) })} className={`${inputCls} block w-24`} />
          </label>
        </div>
      </section>

      <section className="space-y-3 border-t border-gray-800 pt-4">
        <h4 className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Position</h4>
        <Segmented
          label="Placing"
          value={mode}
          onChange={v => setMode(v as Mode)}
          options={[{ id: 'pack', label: '🎴 Pack opening', dot: moved(layout.pack) }, { id: 'collection', label: '📋 Collection', dot: moved(layout.collection) }]}
          wrap
        />
        <p className="text-xs text-gray-500 leading-relaxed">
          The size and position of the {viewName} are independent of the other view. <strong className="text-gray-400">Drag the canvas</strong>, or click it and use the arrow keys (Shift for bigger steps).
        </p>
        <label className="block space-y-1 text-sm text-gray-300">
          Size <span className="text-white font-semibold">{Math.round(placement.scale * 100)}%</span>
          <input
            type="range" min={0.3} max={1.5} step={0.01} value={placement.scale}
            onChange={e => setPlacement({ scale: Number(e.target.value) })}
            className="block w-full accent-yellow-500"
          />
        </label>
        <div className="flex gap-3">
          <label className="text-xs text-gray-500 space-y-1">Offset X
            <input type="number" value={placement.offsetX} onChange={e => setPlacement({ offsetX: Number(e.target.value) })} className={`${inputCls} block w-24`} />
          </label>
          <label className="text-xs text-gray-500 space-y-1">Offset Y
            <input type="number" value={placement.offsetY} onChange={e => setPlacement({ offsetY: Number(e.target.value) })} className={`${inputCls} block w-24`} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPlacement({ offsetX: 0, offsetY: 0 })} className={ghost}>Center</button>
          <button type="button" onClick={() => setPlacement({ ...DEFAULT_PLACEMENT })} className={`${btn} text-gray-400 hover:text-white`}>Reset {viewName}</button>
        </div>
      </section>

      <button type="button" onClick={() => setLayoutVals(DEFAULT_LAYOUT)} className="text-xs text-gray-500 hover:text-red-300">Reset the whole layout</button>
    </div>
  );

  return (
    <div data-workspace className="flex flex-col gap-3 xl:h-full min-h-0">
      {/* ── Options bar ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-900/80 border border-gray-800 px-3 py-2">
        <label className="flex items-center gap-2 text-xs text-gray-400 font-semibold">
          Editing
          <select
            value={scope}
            onChange={e => setScope(e.target.value)}
            className="rounded-md bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm text-white focus:border-yellow-500 focus:outline-none max-w-[14rem]"
          >
            <option value="global">Everything (global)</option>
            {packs.map(p => (
              <option key={p.id} value={p.id}>Pack: {p.name}{Object.keys(packVals[p.id] ?? {}).length ? ' ●' : ''}</option>
            ))}
          </select>
        </label>
        {isPack && <span className="text-xs text-yellow-300/80 hidden md:inline">Only what you change applies to this pack; the rest follows global.</span>}

        <Popover label="Presets" badge={presets.length || undefined}>
          <div className="w-80 space-y-3 text-sm">
            <p className="text-xs text-gray-500">A preset is a named set of {isPack ? 'this pack’s effective' : 'global'} values you can apply later{isPack ? ' to any pack' : ''}.</p>
            {presets.length === 0 && <p className="text-xs text-gray-600">No presets yet.</p>}
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {presets.map(p => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-gray-200">{p.name} <span className="text-gray-600 text-xs">· {Object.keys(p.props).length}</span></span>
                  <button type="button" onClick={() => applyPreset(p)} className={`${btn} border border-gray-700 text-gray-200 hover:border-yellow-500 py-1`}>Apply</button>
                  <form action={deletePresetAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="scope" value={scope} />
                    <button type="submit" className={`${btn} text-gray-500 hover:text-red-300 py-1`} aria-label={`Delete preset ${p.name}`}>Delete</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={savePresetAction} className="flex items-center gap-2">
              <input type="hidden" name="props" value={JSON.stringify(effectiveSparse)} />
              <input type="hidden" name="scope" value={scope} />
              <input
                name="name"
                value={presetName}
                onChange={e => setPresetName(e.target.value)}
                maxLength={40}
                placeholder="New preset name"
                className="flex-1 min-w-0 rounded-md bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm text-white focus:border-yellow-500 focus:outline-none"
              />
              <button type="submit" disabled={!presetName.trim()} className={`${ghost} disabled:opacity-40`}>Save</button>
            </form>
            {dirty && <p className="text-xs text-yellow-500/80">Saving a preset reloads the page. Save your changes first.</p>}
          </div>
        </Popover>

        <Popover label="Import / Export">
          <div className="w-80 space-y-2 text-sm">
            <p className="text-xs text-gray-500">Share or back up this look as JSON. Importing replaces the values at the current scope (you can still Revert).</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={download} className={ghost}>⬇ Download</button>
              <button type="button" onClick={copyJson} className={ghost}>Copy</button>
              <label className={`${ghost} cursor-pointer`}>
                Import file…
                <input
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) runImport(await f.text());
                  }}
                />
              </label>
            </div>
            <textarea
              value={importText}
              onChange={e => { setImportText(e.target.value); setImportError(''); }}
              rows={3}
              placeholder="…or paste exported JSON here"
              className="w-full rounded-md bg-gray-950 border border-gray-700 px-2 py-1.5 text-xs font-mono text-white focus:border-yellow-500 focus:outline-none"
            />
            <div className="flex items-center gap-3">
              <button type="button" disabled={!importText.trim()} onClick={() => runImport(importText)} className={`${ghost} disabled:opacity-40`}>Import pasted JSON</button>
              {importError && <span role="alert" className="text-xs text-red-300">{importError}</span>}
            </div>
          </div>
        </Popover>

        <span role="status" className="flex-1 min-w-0 truncate text-xs text-green-300 px-2">{notice}</span>

        <span className="text-xs text-gray-500 hidden md:inline">
          {dirty
            ? <span className="text-yellow-500">Unsaved: {[changedLayout && 'layout', changedGlobal && 'look', ...changedPacks.map(id => packs.find(p => p.id === id)?.name ?? id)].filter(Boolean).join(', ')}</span>
            : 'Saved. Refresh the OBS source to apply.'}
        </span>
        <form action={saveAction} className="flex items-center gap-2">
          <input type="hidden" name="payload" value={payload} />
          <input type="hidden" name="scope" value={scope} />
          <button type="button" disabled={!dirty} onClick={revert} className={`${btn} text-gray-400 hover:text-white disabled:opacity-40`}>Revert</button>
          <button type="submit" disabled={!dirty} className={`${btn} bg-yellow-500 text-gray-950 hover:bg-yellow-400 disabled:opacity-40`}>Save</button>
        </form>
      </div>

      <div className="flex-1 min-h-0 grid gap-3 xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* ── Canvas ── */}
        <div className="min-h-0 min-w-0 flex flex-col gap-2">
          <div
            ref={boxRef}
            className="relative flex-1 min-h-[16rem] h-[55vh] xl:h-auto rounded-xl border border-gray-800 bg-gray-950/70 overflow-hidden flex items-center justify-center"
          >
            <div
              className="relative overflow-hidden rounded-md border border-gray-700 shrink-0 outline-none focus-visible:border-yellow-500"
              tabIndex={dragging ? 0 : -1}
              onKeyDown={onKeyDown}
              style={{
                width: frameW,
                height: frameH,
                backgroundColor: '#1a1d23',
                backgroundImage: 'conic-gradient(#262a32 25%, transparent 0 50%, #262a32 0 75%, transparent 0)',
                backgroundSize: '24px 24px',
              }}
            >
              <iframe
                ref={frameRef}
                src="/overlay.html?preview"
                title="Overlay preview"
                onLoad={() => { setReady(true); setLoadedCount(c => c + 1); }}
                style={{
                  width: layout.width,
                  height: layout.height,
                  border: 0,
                  background: 'transparent',
                  colorScheme: 'light',
                  transform: `scale(${fit})`,
                  transformOrigin: 'top left',
                  pointerEvents: 'none',
                }}
              />
              {dragging && (
                <>
                  {/* Centre guides: the middle of the browser source */}
                  <div className="absolute inset-y-0 left-1/2 w-px bg-yellow-400/25 pointer-events-none" />
                  <div className="absolute inset-x-0 top-1/2 h-px bg-yellow-400/25 pointer-events-none" />
                  <div
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    className="absolute inset-0 cursor-move touch-none"
                    aria-label={`Drag to move the ${viewName}`}
                  />
                </>
              )}
              {!ready && <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">Loading preview…</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-900/80 border border-gray-800 px-3 py-2">
            <Segmented
              label="View"
              value={mode}
              onChange={v => { setMode(v as Mode); if (v === 'collection' && !isPack && category !== 'layout') setCategory('lists'); }}
              options={[{ id: 'pack', label: '🎴 Pack opening' }, { id: 'collection', label: '📋 Collection' }]}
              disabled={isPack ? ['collection'] : []}
            />
            {mode === 'pack' && (
              <Segmented
                label="Show as"
                value={version}
                onChange={v => setVersion(v as VariantId)}
                options={VARIANT_IDS.map(v => ({ id: v, label: VERSION_LABELS[v] }))}
              />
            )}
            <button
              type="button"
              onClick={play}
              disabled={!ready || playing}
              className={`${btn} ml-auto bg-yellow-500 text-gray-950 hover:bg-yellow-400 disabled:opacity-40`}
            >
              {playing ? '… playing' : mode === 'pack' ? '▶ Play pack opening' : '▶ Play collection'}
            </button>
          </div>
        </div>

        {/* ── Properties dock ── */}
        <div className="min-h-0 flex rounded-xl border border-gray-800 bg-gray-900/80 overflow-hidden h-[75vh] xl:h-auto">
          <nav aria-label="Property categories" className="w-[4.5rem] shrink-0 border-r border-gray-800 bg-gray-950/50 flex flex-col py-2 gap-1">
            {rail.map(g => {
              const n = g.id === 'layout' ? layoutMoved : modifiedCount(g.id);
              const active = !searching && (g.id === 'layout' ? layoutCat : !layoutCat && cat.id === g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setCategory(g.id);
                    setQuery('');
                    if (g.id === 'reveal' || g.id === 'versions') setMode('pack');
                  }}
                  aria-current={active ? 'page' : undefined}
                  title={g.description}
                  className={`relative mx-1.5 rounded-lg py-2 flex flex-col items-center gap-0.5 text-[11px] font-semibold transition-colors ${active ? 'bg-yellow-500/15 text-yellow-300' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                >
                  <span className="text-lg leading-none" aria-hidden>{g.icon}</span>
                  {g.label}
                  {n > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-yellow-500 text-gray-950 text-[10px] font-bold leading-4 text-center">{n}</span>}
                </button>
              );
            })}
          </nav>

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="p-3 space-y-2 border-b border-gray-800">
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search every setting…"
                aria-label="Search settings"
                className="w-full rounded-md bg-gray-950 border border-gray-700 px-2.5 py-1.5 text-sm text-white placeholder:text-gray-600 focus:border-yellow-500 focus:outline-none"
              />
              {!searching && layoutCat && (
                <div className="min-w-0">
                  <h3 className="font-semibold text-white text-sm">{LAYOUT_CAT.icon} {LAYOUT_CAT.label}</h3>
                  <p className="text-xs text-gray-500 leading-snug">{LAYOUT_CAT.description}</p>
                </div>
              )}
              {!searching && !layoutCat && (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white text-sm">{cat.icon} {cat.label}</h3>
                    <p className="text-xs text-gray-500 leading-snug">{cat.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setOpenMap(m => ({ ...m, ...Object.fromEntries(catSections.map(([n]) => [`${scopeKey}/${n}`, true])) }))}
                      className="text-xs text-gray-500 hover:text-white"
                    >Expand all</button>
                    <button
                      type="button"
                      onClick={() => setOpenMap(m => ({ ...m, ...Object.fromEntries(catSections.map(([n]) => [`${scopeKey}/${n}`, false])) }))}
                      className="text-xs text-gray-500 hover:text-white"
                    >Collapse all</button>
                  </div>
                </div>
              )}

              {!searching && !layoutCat && cat.id === 'versions' && (
                <div className="space-y-1.5">
                  <Segmented
                    label="Version"
                    value={version}
                    onChange={v => { setVersion(v as VariantId); setMode('pack'); }}
                    options={VARIANT_IDS.map(v => ({ id: v, label: VERSION_LABELS[v], dot: versionModified(v) }))}
                    wrap
                  />
                  <label className="flex items-center gap-2 text-xs text-gray-500">
                    Copy the look of
                    <select
                      value=""
                      onChange={e => { if (e.target.value) copyVersion(e.target.value as VariantId); }}
                      className="rounded-md bg-gray-950 border border-gray-700 px-1.5 py-1 text-xs text-gray-200"
                    >
                      <option value="">choose a version…</option>
                      {VARIANT_IDS.filter(v => v !== version).map(v => <option key={v} value={v}>{VERSION_LABELS[v]}</option>)}
                    </select>
                    onto {VERSION_LABELS[version]}
                  </label>
                </div>
              )}

              {!searching && !layoutCat && cat.id === 'lists' && (
                <Segmented
                  label="List"
                  value={listView}
                  onChange={v => setMode(v as Mode)}
                  options={[{ id: 'pack', label: 'Under revealed card' }, { id: 'collection', label: 'Collection view' }]}
                  disabled={isPack ? ['collection'] : []}
                  wrap
                />
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {searching ? (
                searchResults.length === 0
                  ? <p className="p-4 text-sm text-gray-500">No settings match &ldquo;{query}&rdquo;.</p>
                  : <div className="p-3 space-y-4">
                      {searchResults.map(({ d, crumb }) => (
                        <div key={d.key} className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wide text-gray-600">{crumb}</p>
                          {renderRow(d)}
                        </div>
                      ))}
                    </div>
              ) : layoutCat ? layoutPanel : (
                catSections.map(([name, defs], i) => renderSection(scopeKey, name, defs, i))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small building blocks ─────────────────────────────────

/** A button that opens a floating panel; closes on an outside click or Escape. */
function Popover({ label, badge, children }: { label: string; badge?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${open ? 'border-yellow-500 text-yellow-300' : 'border-gray-700 text-gray-200 hover:border-gray-500'}`}
      >
        {label}{badge ? <span className="ml-1.5 text-xs text-gray-500">{badge}</span> : null} <span aria-hidden className="text-[10px] text-gray-500">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-40 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl p-3">
          {children}
        </div>
      )}
    </div>
  );
}

/** A row of mutually exclusive choices. */
function Segmented({
  label, value, onChange, options, disabled = [], wrap = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string; dot?: boolean }[];
  disabled?: string[];
  wrap?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className={`flex items-center gap-1 ${wrap ? 'flex-wrap' : ''}`}>
      <span className="text-xs text-gray-500 mr-1">{label}</span>
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          disabled={disabled.includes(o.id)}
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold border disabled:opacity-35 ${value === o.id ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
        >
          {o.label}{o.dot && <span className="ml-1 text-yellow-400">●</span>}
        </button>
      ))}
    </div>
  );
}

// ── One property row ──────────────────────────────────────

function PropRow({
  def, value, modified, inherited, isPack, off, onChange, onReset,
}: {
  def: PropDef;
  value: PropValue;
  modified: boolean;
  inherited: boolean;
  isPack: boolean;
  off: boolean;
  onChange: (v: unknown) => void;
  onReset: () => void;
}) {
  const id = `prop-${def.key}`;
  const styleHelp = def.key === 'reveal.style' ? REVEAL_STYLES.find(s => s.value === value)?.description : undefined;
  const inline = def.type === 'boolean';
  const label = (
    <label htmlFor={id} className="text-sm text-gray-200 font-medium">
      {def.label}
      {modified && <span className="ml-1.5 text-yellow-400" title={isPack ? 'Overridden for this pack' : 'Changed from the default'}>●</span>}
      {inherited && <span className="ml-1.5 text-xs text-gray-600 font-normal">(from global)</span>}
      {def.experimental && <span className="ml-1.5 text-[10px] uppercase tracking-wide rounded bg-purple-500/20 text-purple-300 px-1.5 py-0.5 font-semibold">experimental</span>}
    </label>
  );
  const reset = (
    <button
      type="button"
      onClick={onReset}
      disabled={!modified}
      className="text-xs text-gray-500 hover:text-white disabled:opacity-0 shrink-0"
      title={isPack ? 'Stop overriding (use the global value)' : `Reset to ${formatValue(def, def.default)}`}
    >
      {isPack ? 'inherit' : 'reset'}
    </button>
  );
  return (
    <div className={`space-y-1 ${off ? 'opacity-45' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        {label}
        <span className="flex items-center gap-2">
          {reset}
          {inline && <Control def={def} id={id} value={value} onChange={onChange} />}
        </span>
      </div>
      {!inline && <Control def={def} id={id} value={value} onChange={onChange} />}
      {(styleHelp || def.help) && <p className="text-xs text-gray-500 leading-relaxed">{styleHelp ?? def.help}</p>}
    </div>
  );
}

function formatValue(def: PropDef, v: PropValue): string {
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (def.type === 'select') return def.options?.find(o => o.value === v)?.label ?? String(v);
  return `${v}${def.unit ?? ''}`;
}

const inputCls = 'rounded-md bg-gray-950 border border-gray-700 px-2 py-1 text-sm text-white focus:border-yellow-500 focus:outline-none';

function Control({ def, id, value, onChange }: { def: PropDef; id: string; value: PropValue; onChange: (v: unknown) => void }) {
  switch (def.type) {
    case 'number': {
      const n = typeof value === 'number' ? value : Number(def.default);
      return (
        <div className="flex items-center gap-3">
          <input
            id={id}
            type="range"
            min={def.min}
            max={def.max}
            step={def.step ?? 1}
            value={n}
            onChange={e => onChange(Number(e.target.value))}
            className="flex-1 accent-yellow-500 min-w-0"
          />
          <span className="flex items-center gap-1 shrink-0">
            <input
              type="number"
              aria-label={`${def.label} value`}
              min={def.min}
              max={def.max}
              step={def.step ?? 1}
              value={n}
              onChange={e => { if (e.target.value !== '') onChange(Number(e.target.value)); }}
              className={`${inputCls} w-20`}
            />
            {def.unit && <span className="text-xs text-gray-500 w-4">{def.unit}</span>}
          </span>
        </div>
      );
    }
    case 'boolean': {
      const on = value === true;
      return (
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => onChange(!on)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-yellow-500' : 'bg-gray-700'}`}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      );
    }
    case 'select':
      return (
        <select id={id} value={String(value)} onChange={e => onChange(e.target.value)} className={`${inputCls} w-full`}>
          {def.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'color': {
      const c = typeof value === 'string' ? value : '#ffffff';
      return (
        <div className="flex items-center gap-2">
          <input id={id} type="color" value={c} onChange={e => onChange(e.target.value)} className="h-8 w-12 rounded bg-transparent border border-gray-700 cursor-pointer" />
          <input
            type="text"
            aria-label={`${def.label} hex`}
            defaultValue={c}
            key={c}
            maxLength={7}
            onBlur={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onChange((e.target as HTMLInputElement).value); } }}
            className={`${inputCls} w-24 font-mono`}
          />
        </div>
      );
    }
    case 'colors': {
      const list = Array.isArray(value) ? value : [];
      const min = def.minItems ?? 1, max = def.maxItems ?? 8;
      const set = (i: number, c: string) => onChange(list.map((x, j) => (j === i ? c : x)));
      return (
        <div className="space-y-2">
          <div
            aria-hidden
            className="h-3 rounded-full border border-gray-700"
            style={{ background: list.length > 1 ? `linear-gradient(90deg, ${list.join(', ')})` : list[0] ?? '#000' }}
          />
          <div id={id} className="flex flex-wrap items-center gap-2">
            {list.map((c, i) => (
              <span key={i} className="relative inline-flex">
                <input type="color" aria-label={`${def.label} ${i + 1}`} value={c} onChange={e => set(i, e.target.value)} className="h-8 w-10 rounded bg-transparent border border-gray-700 cursor-pointer" />
                {list.length > min && (
                  <button
                    type="button"
                    aria-label={`Remove colour ${i + 1}`}
                    onClick={() => onChange(list.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-800 border border-gray-600 text-[10px] leading-none text-gray-300 hover:text-red-300"
                  >×</button>
                )}
              </span>
            ))}
            {list.length < max && (
              <button
                type="button"
                onClick={() => onChange([...list, list[list.length - 1] ?? '#ffffff'])}
                className="h-8 px-2 rounded border border-dashed border-gray-600 text-xs text-gray-400 hover:text-white hover:border-gray-400"
              >+ add</button>
            )}
          </div>
        </div>
      );
    }
    case 'text':
      return (
        <input
          id={id}
          type="text"
          value={String(value)}
          maxLength={def.maxLength}
          onChange={e => onChange(e.target.value)}
          className={`${inputCls} w-full`}
        />
      );
  }
}

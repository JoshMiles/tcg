'use client';
import { Icon, type IconName } from '@/app/components/Icon';
import { PendingButton } from '../components/PendingButton';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  PROPS, PROP_BY_KEY, PROP_GROUPS, REVEAL_STYLES, SECTION_ORDER, VARIANT_IDS, cleanValue, exportProps, importProps,
  type PropDef, type PropValue, type PropValues, type VariantId,
} from '@/lib/overlay-props';
import { DEFAULT_LAYOUT, DEFAULT_PLACEMENT, LAYOUT_PRESETS, sanitizeLayout, type OverlayLayout, type Placement } from '@/lib/overlay-layout';
import { diffLayout, diffProps } from '@/lib/overlay-diff';
import { PERF_LABEL, variantPerf, type PerfLevel } from '@/lib/overlay-perf';
import { deleteOverlayVersionAction, refreshOverlayAction, setSeasonLookAction } from '../overlay-actions';

// The Overlay Editor: one Photoshop-style workspace for where the overlay sits (Layout) and how it looks and moves. Everything is generated from the registry in
// lib/overlay-props.ts. Layout: an options bar (scope, presets, import/export, save) over a fixed canvas (the real overlay
// in an iframe, always fitted whole into the available space, never scrolling) and a docked properties panel (category
// rail, version tabs, collapsible sections, search). Values are stored sparsely; there are two scopes: Global and
// per-pack overrides. The preview is /overlay.html?preview fed the unsaved values by postMessage.

interface PackInfo { id: string; name: string }
interface PresetInfo { id: string; name: string; props: PropValues; updatedAt: number }
interface VersionInfo { id: string; at: number; note: string; layout: OverlayLayout; props: PropValues; packs: Record<string, PropValues> }
interface SeasonInfo { id: string; name: string; active: boolean }
interface CardInfo { number: number; name: string; stars: number }
type Snap = { g: PropValues; p: Record<string, PropValues>; l: OverlayLayout };
type Bg = 'checker' | 'dark' | 'light' | 'green' | 'image';
const PERF_STYLE: Record<PerfLevel, string> = { light: 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10', medium: 'text-amber-300 border-amber-400/30 bg-amber-500/10', heavy: 'text-red-300 border-red-400/30 bg-red-500/10' };
type Mode = 'pack' | 'collection';

const VARIANT_LABELS: Record<VariantId, string> = { regular: 'Regular', reverse: 'Reverse Holo', full: 'Full Art', shiny: 'Shiny' };

const canon = (v: PropValues) => JSON.stringify(Object.keys(v).sort().map(k => [k, v[k]]));
const eq = (a: PropValue | undefined, b: PropValue | undefined) => JSON.stringify(a) === JSON.stringify(b);
const snapKey = (x: Snap) => JSON.stringify([canon(x.g), Object.keys(x.p).sort().map(k => [k, canon(x.p[k])]), x.l]);
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
    if (/^burst(Opacity|Size|Rays|Speed|Color|Hue)$/.test(name)) return { key: `${g}.burst`, when: v => v === true };
  }
  if (key === 'reveal.gotText') return { key: 'reveal.showGotLine', when: v => v === true };
  if (key === 'collection.headingText') return { key: 'collection.showHeading', when: v => v === true };
  return null;
}

// "Layout" sits in the rail beside the registry's categories but isn't registry-driven: it edits the stage size and where each
// view is placed. Layout is global (not per pack), so it is hidden while editing a pack.
const LAYOUT_CAT: { id: string; label: string; icon: IconName; description: string } = { id: 'layout', label: 'Layout', icon: 'ruler', description: 'Where the overlay sits on your OBS browser source.' };

type SidebarWindow = Window & { __tcgSidebarForce?: boolean };

export function OverlayEditor({
  initialGlobal, initialPacks, packs, presets, initialLayout, initialScope, saveAction, savePresetAction, deletePresetAction,
  versions, seasons, seasonLooks, packCards, initialAutoReload,
}: {
  versions: VersionInfo[];
  seasons: SeasonInfo[];
  seasonLooks: Record<string, string>;
  packCards: Record<string, CardInfo[]>;
  initialAutoReload: boolean;
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
  const [category, setCategory] = useState('pack');
  const [version, setVersion] = useState<VariantId>('regular');   // the variant being edited AND previewed
  const [mode, setMode] = useState<Mode>('pack');                  // which view the canvas shows
  const [variantOpen, setVariantOpen] = useState(false);          // Variants: false = the variant picker, true = editing `version`
  const [focusKey, setFocusKey] = useState('');                    // a section to scroll into view after a click on the preview
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

  // View tools, saved-version list, season looks, preview picker, save options.
  const [zoom, setZoom] = useState(1);
  const [showThirds, setShowThirds] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showSafe, setShowSafe] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [bg, setBg] = useState<Bg>('checker');
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);          // before / after: show the saved look instead of the edit
  const [pickPack, setPickPack] = useState('');
  const [pickCard, setPickCard] = useState(0);
  const [versionList, setVersionList] = useState(versions);
  const [looks, setLooks] = useState(seasonLooks);
  const [note, setNote] = useState('');
  const [autoReload, setAutoReload] = useState(initialAutoReload);
  const [refreshing, startRefresh] = useTransition();
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [copyFrom, setCopyFrom] = useState('');

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

  // ── Undo / redo: every edit (a drag or a slider burst counts as one) is a step; Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y ──
  const stateRef = useRef<Snap>({ g: globalVals, p: packVals, l: layoutVals });
  stateRef.current = { g: globalVals, p: packVals, l: layoutVals };
  const hist = useRef<{ list: Snap[]; i: number; timer: ReturnType<typeof setTimeout> | null; skip: boolean }>({
    list: [{ g: initialGlobal, p: initialPacks, l: initialLayout }], i: 0, timer: null, skip: false,
  });
  const [, bump] = useState(0);
  const commit = useCallback(() => {
    const h = hist.current;
    if (h.timer) { clearTimeout(h.timer); h.timer = null; }
    const cur = stateRef.current;
    if (snapKey(cur) === snapKey(h.list[h.i])) return;
    h.list = [...h.list.slice(0, h.i + 1), cur].slice(-60);
    h.i = h.list.length - 1;
    bump(n => n + 1);
  }, []);
  useEffect(() => {
    const h = hist.current;
    if (h.skip) { h.skip = false; return; }
    if (h.timer) clearTimeout(h.timer);
    h.timer = setTimeout(commit, 500);
  }, [globalVals, packVals, layoutVals, commit]);
  const restoreSnap = (x: Snap) => { hist.current.skip = true; setGlobalVals(x.g); setPackVals(x.p); setLayoutVals(x.l); bump(n => n + 1); };
  const undo = () => { commit(); const h = hist.current; if (h.i > 0) { h.i--; restoreSnap(h.list[h.i]); } };
  const redo = () => { commit(); const h = hist.current; if (h.i < h.list.length - 1) { h.i++; restoreSnap(h.list[h.i]); } };
  const undoRef = useRef(undo); undoRef.current = undo;
  const redoRef = useRef(redo); redoRef.current = redo;
  const canUndo = hist.current.i > 0 || snapKey(stateRef.current) !== snapKey(hist.current.list[hist.current.i]);
  const canRedo = hist.current.i < hist.current.list.length - 1;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && ['text', 'search', 'number', 'url', ''].includes((t as HTMLInputElement).type)))) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undoRef.current(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redoRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
  // Review changes: every setting that differs from what is saved.
  const diffs = [
    ...diffLayout(initialLayout, layout),
    ...diffProps('Everything', initialGlobal, globalVals, k => PROP_BY_KEY[k]?.default),
    ...changedPacks.flatMap(id => diffProps(`Pack: ${packs.find(x => x.id === id)?.name ?? id}`, initialPacks[id] ?? {}, packVals[id] ?? {}, () => '(follows global)')),
  ];
  useEffect(() => { if (!dirty) setShowSaved(false); }, [dirty]);
  const shownLayout = showSaved ? initialLayout : layout;
  const savedEffective: PropValues = isPack ? { ...initialGlobal, ...(initialPacks[scope] ?? {}) } : initialGlobal;
  const versionDistance = (v: VersionInfo) =>
    diffLayout(v.layout, layout).length +
    diffProps('', v.props, globalVals, k => PROP_BY_KEY[k]?.default).length +
    [...new Set([...Object.keys(v.packs), ...Object.keys(packVals)])].reduce((n, id) => n + diffProps('', v.packs[id] ?? {}, packVals[id] ?? {}, () => '(follows global)').length, 0);
  const loadVersion = (v: VersionInfo) => {
    setGlobalVals(v.props); setPackVals(v.packs); setLayoutVals(v.layout);
    setNotice(`Loaded the version from ${new Date(v.at).toLocaleString()}. Review, then Save.`);
  };

  // The values that apply at this scope, sparse: what the preview shows and what export/presets capture.
  const effectiveSparse: PropValues = useMemo(() => (isPack ? { ...globalVals, ...(packVals[scope] ?? {}) } : globalVals), [isPack, globalVals, packVals, scope]);
  const shownProps = showSaved ? savedEffective : effectiveSparse;

  // ── What is listed ──
  const hiddenInScope = (d: PropDef) => isPack && d.group === 'collection'; // the collection view isn't per-pack
  const defsFor = (cat: string): PropDef[] => PROPS.filter(d => {
    if (d.group !== cat || hiddenInScope(d)) return false;
    if (cat === 'variants') return d.variant === version;
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
  // Which pack / card the preview shows: the pack being edited, or the one picked in the preview bar.
  const previewPackId = isPack ? scope : pickPack;
  const previewCards = packCards[previewPackId || packs[0]?.id || ''] ?? [];
  const previewCard = previewCards.some(c => c.number === pickCard) ? pickCard : 0;
  useEffect(() => { if (ready) post({ type: 'layout', layout: shownLayout }); }, [ready, loadedCount, shownLayout, post]);
  useEffect(() => { if (ready) post({ type: 'variant', variant: previewVariant }); }, [ready, loadedCount, previewVariant, post]);
  useEffect(() => { if (ready) post({ type: 'props', props: shownProps, packId: previewPackId, cardNumber: previewCard }); }, [ready, loadedCount, shownProps, previewPackId, previewCard, post]);
  useEffect(() => { if (ready) post({ type: 'static', mode }); }, [ready, loadedCount, mode, post]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Fit the whole stage into the canvas area, both ways, so the preview never needs to scroll.
  const fitBase = box.w > 0 && box.h > 0 ? Math.min(box.w / shownLayout.width, box.h / shownLayout.height) : 0.3;
  const fit = fitBase * zoom;   // zoom > 1 scrolls the canvas; everything below works in this scale
  const frameW = shownLayout.width * fit, frameH = shownLayout.height * fit;

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
  const copyVariant = (from: VariantId) => {
    const next: PropValues = { ...current };
    for (const d of PROPS.filter(x => x.variant === version)) {
      const src = PROP_BY_KEY[d.key.replace(`variant.${version}.`, `variant.${from}.`)];
      if (!src) continue;
      const v = valueOf(src.key);
      // In global scope store sparsely; in pack scope store the value explicitly.
      if (!isPack && eq(v, d.default)) delete next[d.key]; else next[d.key] = v;
    }
    replaceCurrent(next);
    setNotice(`Copied the ${VARIANT_LABELS[from]} look onto ${VARIANT_LABELS[version]}. Review, then Save.`);
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
      <section key={k} data-section={k} className="border-b border-gray-800/80 last:border-0">
        <div className="flex items-center gap-1 pr-2">
          <button
            type="button"
            onClick={() => setOpenMap(m => ({ ...m, [k]: !open }))}
            aria-expanded={open}
            className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5"
          >
            <span aria-hidden className={`text-[10px] text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`}><Icon name="chevronRight" className="w-3 h-3" /></span>
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
  const rail = isPack ? PROP_GROUPS.filter(g => g.id !== 'collection') : [LAYOUT_CAT, ...PROP_GROUPS];
  const dragging = layoutCat && !query.trim();

  // Dragging the canvas (or the arrow keys) moves the view being edited. One screen pixel = 1/fit design pixels.
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: placement.offsetX, oy: placement.offsetY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    let nx = Math.round(d.ox + (e.clientX - d.x) / fit);
    let ny = Math.round(d.oy + (e.clientY - d.y) / fit);
    if (snapOn && !e.altKey) {
      // Snap to the centre lines (within 8 screen pixels), else to a 10 px grid. Hold Alt to move freely.
      const near = Math.max(2, Math.round(8 / fit));
      nx = Math.abs(nx) <= near ? 0 : Math.round(nx / 10) * 10;
      ny = Math.abs(ny) <= near ? 0 : Math.round(ny / 10) * 10;
    }
    setPlacement({ offsetX: nx, offsetY: ny });
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

  const catId = isPack && category === 'collection' ? 'pack' : category;   // the collection view isn't per-pack
  // Clicking an element in the preview opens its settings.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const data = e.data as { type?: string; target?: string } | null;
      if (data?.type !== 'select' || !data.target) return;
      const go = (c: string, section?: string) => {
        setCategory(c);
        setQuery('');
        setMode(c === 'collection' ? 'collection' : 'pack');
        if (c === 'variants') setVariantOpen(true);
        if (section) {
          const k = `${c}${c === 'variants' ? '.' + version : ''}/${section}`;
          setOpenMap(m => ({ ...m, [k]: true }));
          setFocusKey(k);
        }
      };
      switch (data.target) {
        case 'card': go('variants'); break;
        case 'label': go('variants', 'Label'); break;
        case 'bar': go('pack', 'Name and stars bar'); break;
        case 'got': go('pack', '"got:" line'); break;
        case 'strip': go('pack', 'Cards under the card'); break;
        case 'heading': if (!isPack) go('collection', 'What to show'); break;
        case 'collection': if (!isPack) go('collection', 'Layout'); break;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [version, isPack]);
  useEffect(() => {
    if (!focusKey) return;
    document.querySelector(`[data-section="${CSS.escape(focusKey)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setFocusKey('');
  }, [focusKey]);

  const cat = PROP_GROUPS.find(g => g.id === catId) ?? PROP_GROUPS[0];
  const catDefs = defsFor(cat.id);
  const scopeKey = `${cat.id}${cat.id === 'variants' ? '.' + version : ''}`;
  const variantPicker = cat.id === 'variants' && !variantOpen;
  const catSections = groupSections(catDefs);

  // Search results span every category (and every version), labelled with where each one lives.
  const searchResults = searching
    ? PROP_GROUPS.flatMap(g => groupSections(PROPS.filter(d => d.group === g.id && !hiddenInScope(d) && matches(d)))
        .flatMap(([name, defs]) => defs.map(d => ({ d, crumb: `${g.label}${d.variant ? ' › ' + VARIANT_LABELS[d.variant] : ''} › ${name}` }))))
    : [];

  const variantSummary = (v: VariantId) => {
    const g = (n: string) => valueOf(`variant.${v}.${n}`);
    const bits: string[] = [];
    if (g('holoMode') === 'on') bits.push('Holo'); else if (g('holoMode') === 'auto') bits.push('Holo by stars');
    if (g('glow') === true) bits.push('Glow');
    if (g('pop') === true) bits.push('Pop');
    if (g('tilt') === true) bits.push('3D tilt');
    if (g('rock') === true) bits.push('Rock');
    if (g('sparkles') === true) bits.push('Sparkles');
    return bits.join(' · ') || 'Plain';
  };
  const variantPickerList = (
    <div className="p-3 space-y-2">
      <p className="text-xs text-gray-500 leading-relaxed">Choose a card variant to edit. Clicking the card in the preview opens the variant you are previewing.</p>
      {VARIANT_IDS.map(v => {
        const colors = valueOf(`variant.${v}.labelColors`) as string[];
        const changed = PROPS.filter(d => d.variant === v && current[d.key] !== undefined).length;
        return (
          <button
            key={v}
            type="button"
            onClick={() => { setVersion(v); setVariantOpen(true); setMode('pack'); }}
            className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 transition-colors ${version === v ? 'border-yellow-500/60 bg-yellow-500/5' : 'border-gray-700 hover:border-gray-500 hover:bg-white/5'}`}
          >
            <span
              className="px-2.5 py-1 rounded-full text-[11px] font-bold text-white shrink-0 max-w-[8rem] truncate"
              style={{ background: colors.length > 1 ? `linear-gradient(90deg, ${colors.join(', ')})` : colors[0] }}
            >
              {String(valueOf(`variant.${v}.labelText`))}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-white">{VARIANT_LABELS[v]}</span>
              <span className="block text-xs text-gray-500 truncate">{variantSummary(v)}</span>
            </span>
            {(() => { const r = variantPerf(valueOf, v); return <span title={r.reasons.join(', ') || 'A rough guide to how hard this version works the overlay'} className={`text-[10px] font-bold rounded-full border px-1.5 shrink-0 ${PERF_STYLE[r.level]}`}>{PERF_LABEL[r.level]}</span>; })()}
            {version === v && <span className="text-[10px] uppercase tracking-wide text-yellow-400 font-bold shrink-0">Previewing</span>}
            {changed > 0 && <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 rounded-full px-1.5 shrink-0">{changed}</span>}
            <span aria-hidden className="text-gray-500">›</span>
          </button>
        );
      })}
    </div>
  );

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
          options={[{ id: 'pack', label: 'Pack opening', dot: moved(layout.pack) }, { id: 'collection', label: 'Collection', dot: moved(layout.collection) }]}
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
                    <PendingButton type="submit" className={`${btn} text-gray-500 hover:text-red-300 py-1`} aria-label={`Delete preset ${p.name}`}>Delete</PendingButton>
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
              <PendingButton type="submit" disabled={!presetName.trim()} className={`${ghost} disabled:opacity-40`}>Save</PendingButton>
            </form>
            {dirty && <p className="text-xs text-yellow-500/80">Saving a preset reloads the page. Save your changes first.</p>}

            {seasons.length > 0 && presets.length > 0 && (
              <div className="border-t border-gray-800 pt-3 space-y-2">
                <p className="text-xs font-semibold text-gray-300">Season looks</p>
                <p className="text-xs text-gray-500">Attach a preset to a season: while it is the active season its look is layered over the global values (a pack&apos;s own overrides still win). Applied immediately, no Save needed.</p>
                {seasons.map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="flex-1 truncate">{s.name}{s.active && <span className="ml-1 text-green-400">(active)</span>}</span>
                    <select
                      value={looks[s.id] ?? ''}
                      onChange={async e => {
                        const id = e.target.value || null;
                        const r = await setSeasonLookAction(s.id, id);
                        if (r.ok) setLooks(l => { const n = { ...l }; if (id) n[s.id] = id; else delete n[s.id]; return n; });
                        setNotice(r.message);
                      }}
                      aria-label={`Look for ${s.name}`}
                      className="rounded-md bg-gray-950 border border-gray-700 px-1.5 py-1 text-xs text-gray-200 max-w-[9rem]"
                    >
                      <option value="">Global look</option>
                      {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>
        </Popover>

        <Popover label="Versions" icon="history" badge={versionList.length || undefined}>
          <div className="w-96 space-y-2 text-sm">
            <p className="text-xs text-gray-500">Every save keeps a version (newest 20). Load one into the editor to compare, then Save to make it live.</p>
            {versionList.length === 0 && <p className="text-xs text-gray-600">Nothing saved yet. Your first save starts the history.</p>}
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {versionList.map(v => {
                const dist = versionDistance(v);
                return (
                  <li key={v.id} className="flex items-center gap-2 rounded-lg border border-gray-800 px-2 py-1.5">
                    <span className="flex-1 min-w-0">
                      <span className="block text-gray-200 truncate">{v.note || 'Saved'}</span>
                      <span className="block text-[11px] text-gray-500">{new Date(v.at).toLocaleString()} · {dist === 0 ? 'same as now' : `${dist} difference${dist === 1 ? '' : 's'} from your edit`}</span>
                    </span>
                    <button type="button" disabled={dist === 0} onClick={() => loadVersion(v)} className={`${btn} border border-gray-700 text-gray-200 hover:border-yellow-500 py-1 disabled:opacity-40`}>Load</button>
                    <button
                      type="button"
                      aria-label="Delete version"
                      onClick={async () => { const r = await deleteOverlayVersionAction(v.id); if (r.ok) setVersionList(l => l.filter(x => x.id !== v.id)); }}
                      className="text-gray-600 hover:text-red-300 px-1"
                    ><Icon name="trash" /></button>
                  </li>
                );
              })}
            </ul>
          </div>
        </Popover>

        <Popover label="Import / Export">
          <div className="w-80 space-y-2 text-sm">
            <p className="text-xs text-gray-500">Share or back up this look as JSON. Importing replaces the values at the current scope (you can still Revert).</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={download} className={ghost}><Icon name="download" className="mr-1" />Download</button>
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

        {isPack && (
          <Popover label="Pack tools" icon="copy">
            <div className="w-96 space-y-4 text-sm">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-300">Copy this pack&apos;s look to other packs</p>
                <p className="text-xs text-gray-500">Merges this pack&apos;s {Object.keys(packVals[scope] ?? {}).length} override{Object.keys(packVals[scope] ?? {}).length === 1 ? '' : 's'} into the packs you tick (their other overrides stay). Review, then Save.</p>
                <ul className="max-h-32 overflow-y-auto space-y-1">
                  {packs.filter(x => x.id !== scope).map(x => (
                    <li key={x.id}><label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={copyTargets.includes(x.id)} onChange={e => setCopyTargets(t => (e.target.checked ? [...t, x.id] : t.filter(i => i !== x.id)))} className="accent-yellow-400" />{x.name}</label></li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={copyTargets.length === 0 || Object.keys(packVals[scope] ?? {}).length === 0}
                  onClick={() => {
                    const own = packVals[scope] ?? {};
                    setPackVals(p => ({ ...p, ...Object.fromEntries(copyTargets.map(id => [id, { ...(p[id] ?? {}), ...own }])) }));
                    setNotice(`Copied to ${copyTargets.length} pack${copyTargets.length === 1 ? '' : 's'}. Review, then Save.`);
                    setCopyTargets([]);
                  }}
                  className={`${ghost} disabled:opacity-40`}
                >Copy to {copyTargets.length || '…'}</button>
              </div>
              <div className="space-y-1.5 border-t border-gray-800 pt-3">
                <p className="text-xs font-semibold text-gray-300">Use another pack&apos;s look here</p>
                <div className="flex items-center gap-2">
                  <select value={copyFrom} onChange={e => setCopyFrom(e.target.value)} aria-label="Copy overrides from" className="flex-1 rounded-md bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm text-white">
                    <option value="">Choose a pack…</option>
                    {packs.filter(x => x.id !== scope).map(x => <option key={x.id} value={x.id}>{x.name} ({Object.keys(packVals[x.id] ?? {}).length})</option>)}
                  </select>
                  <button type="button" disabled={!copyFrom} onClick={() => { replaceCurrent({ ...(packVals[copyFrom] ?? {}) }); setNotice('Replaced this pack’s overrides. Review, then Save.'); setCopyFrom(''); }} className={`${ghost} disabled:opacity-40`}>Replace</button>
                </div>
              </div>
              <div className="space-y-1.5 border-t border-gray-800 pt-3">
                <p className="text-xs font-semibold text-gray-300">Differences from global</p>
                {Object.keys(packVals[scope] ?? {}).length === 0 ? <p className="text-xs text-gray-600">This pack follows the global look exactly.</p> : (
                  <ul className="max-h-40 overflow-y-auto space-y-0.5">
                    {diffProps('', globalVals, { ...globalVals, ...(packVals[scope] ?? {}) }, k => PROP_BY_KEY[k]?.default).map((d, i) => (
                      <li key={i} className="text-xs text-gray-400"><span className="text-gray-300">{d.label}</span> <span className="text-gray-600">{d.from} → </span><span className="text-yellow-300">{d.to}</span></li>
                    ))}
                  </ul>
                )}
                <button type="button" disabled={Object.keys(packVals[scope] ?? {}).length === 0} onClick={() => { replaceCurrent({}); setNotice('Cleared this pack’s overrides. Review, then Save.'); }} className={`${btn} text-gray-400 hover:text-red-300 px-0 disabled:opacity-40`}>Clear all overrides</button>
              </div>
            </div>
          </Popover>
        )}

        <div className="flex items-center gap-1" role="group" aria-label="History">
          <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" className="p-2 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-35"><Icon name="undo" /></button>
          <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" className="p-2 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-35"><Icon name="redo" /></button>
        </div>

        <span role="status" className="flex-1 min-w-0 truncate text-xs text-green-300 px-2">{notice}</span>

        <span className="text-xs text-gray-500 hidden md:inline">
          {dirty
            ? <span className="text-yellow-500">Unsaved: {[changedLayout && 'layout', changedGlobal && 'look', ...changedPacks.map(id => packs.find(p => p.id === id)?.name ?? id)].filter(Boolean).join(', ')}</span>
            : 'Saved.'}
        </span>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => startRefresh(async () => { const r = await refreshOverlayAction(); setNotice(r.message); })}
          title="Ask every open overlay (OBS) to reload the saved look"
          className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-700 text-gray-200 hover:border-gray-500 disabled:opacity-50"
        ><Icon name="refresh" className={`mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />Refresh overlay</button>

        <Popover label={`Review${diffs.length ? ` (${diffs.length})` : ''}`} icon="list" align="right" disabled={!dirty}>
          <div className="w-[26rem] max-w-[85vw] space-y-2 text-sm">
            <p className="text-xs text-gray-500">Everything that differs from what is saved. Nothing goes live until you Save.</p>
            <ul className="max-h-80 overflow-y-auto divide-y divide-gray-800/70">
              {diffs.map((d, i) => (
                <li key={i} className="py-1.5 text-xs">
                  <span className="text-[10px] uppercase tracking-wide text-gray-600">{d.scope}</span>
                  <span className="block text-gray-200">{d.label}</span>
                  <span className="text-gray-500">{d.from}</span> <span className="text-gray-600">→</span> <span className="text-yellow-300">{d.to}</span>
                </li>
              ))}
            </ul>
          </div>
        </Popover>

        <form action={saveAction} className="flex items-center gap-2">
          <input type="hidden" name="payload" value={payload} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="note" value={note} />
          <input type="hidden" name="autoReload" value={autoReload ? 'on' : ''} />
          <button type="button" disabled={!dirty} onClick={revert} className={`${btn} text-gray-400 hover:text-white disabled:opacity-40`}>Revert</button>
          <PendingButton type="submit" disabled={!dirty} className={`${btn} bg-yellow-500 text-gray-950 hover:bg-yellow-400 disabled:opacity-40`}>Save</PendingButton>
        </form>
        <Popover label="Save options" icon="settings" align="right">
          <div className="w-72 space-y-3 text-sm">
            <label className="block text-xs text-gray-400 space-y-1">Version note (optional)
              <input value={note} onChange={e => setNote(e.target.value)} maxLength={80} placeholder="e.g. Brighter shiny glow" className="w-full rounded-md bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm text-white focus:border-yellow-500 focus:outline-none" />
            </label>
            <label className="flex items-start gap-2 text-xs text-gray-300"><input type="checkbox" checked={autoReload} onChange={e => setAutoReload(e.target.checked)} className="mt-0.5 accent-yellow-400" /><span>Refresh open overlays after saving. They reload once nothing is animating, so a pack opening is never cut short.</span></label>
          </div>
        </Popover>
      </div>

      <div className="flex-1 min-h-0 grid gap-3 xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* ── Canvas ── */}
        <div className="min-h-0 min-w-0 flex flex-col gap-2">
          <div
            ref={boxRef}
            className="relative flex-1 min-h-[16rem] h-[55vh] xl:h-auto rounded-xl border border-gray-800 bg-gray-950/70 overflow-auto flex"
          >
            <div
              className="relative overflow-hidden rounded-md border border-gray-700 shrink-0 m-auto outline-none focus-visible:border-yellow-500"
              tabIndex={dragging ? 0 : -1}
              onKeyDown={onKeyDown}
              style={{
                width: frameW,
                height: frameH,
                ...(bg === 'image' && bgImage
                  ? { backgroundColor: '#000', backgroundImage: `url(${bgImage})`, backgroundSize: '100% 100%' }
                  : bg === 'dark' ? { backgroundColor: '#07080b' }
                  : bg === 'light' ? { backgroundColor: '#e5e7eb' }
                  : bg === 'green' ? { backgroundColor: '#00b140' }
                  : { backgroundColor: '#1a1d23', backgroundImage: 'conic-gradient(#262a32 25%, transparent 0 50%, #262a32 0 75%, transparent 0)', backgroundSize: '24px 24px' }),
              }}
            >
              <iframe
                ref={frameRef}
                src="/overlay.html?preview"
                title="Overlay preview"
                onLoad={() => { setReady(true); setLoadedCount(c => c + 1); }}
                style={{
                  width: shownLayout.width,
                  height: shownLayout.height,
                  border: 0,
                  background: 'transparent',
                  colorScheme: 'light',
                  transform: `scale(${fit})`,
                  transformOrigin: 'top left',
                }}
              />
              {/* Guides (never part of the overlay, only drawn over the preview) */}
              {showGrid && <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.10) 1px, transparent 1px)', backgroundSize: '10% 10%' }} />}
              {showThirds && (
                <>
                  <div aria-hidden className="absolute inset-y-0 left-1/3 w-px bg-sky-400/40 pointer-events-none" />
                  <div aria-hidden className="absolute inset-y-0 left-2/3 w-px bg-sky-400/40 pointer-events-none" />
                  <div aria-hidden className="absolute inset-x-0 top-1/3 h-px bg-sky-400/40 pointer-events-none" />
                  <div aria-hidden className="absolute inset-x-0 top-2/3 h-px bg-sky-400/40 pointer-events-none" />
                </>
              )}
              {showSafe && (
                <>
                  <div aria-hidden className="absolute inset-[5%] border border-dashed border-amber-300/50 pointer-events-none"><span className="absolute -top-0 left-1 text-[9px] text-amber-300/70">action safe</span></div>
                  <div aria-hidden className="absolute inset-[10%] border border-dashed border-rose-300/50 pointer-events-none"><span className="absolute -top-0 left-1 text-[9px] text-rose-300/70">title safe</span></div>
                </>
              )}
              {showSaved && <span className="absolute top-2 left-2 rounded-md bg-gray-950/85 border border-yellow-500/50 px-2 py-0.5 text-[11px] font-bold text-yellow-300 pointer-events-none">Showing the saved look</span>}
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
              onChange={v => {
                setMode(v as Mode);
                if (!isPack && category !== 'layout') setCategory(v === 'collection' ? 'collection' : category === 'collection' ? 'pack' : category);
              }}
              options={[{ id: 'pack', label: 'Pack opening' }, { id: 'collection', label: 'Collection' }]}
              disabled={isPack ? ['collection'] : []}
            />
            {mode === 'pack' && (
              <Segmented
                label="Preview as"
                value={version}
                onChange={v => setVersion(v as VariantId)}
                options={VARIANT_IDS.map(v => ({ id: v, label: VARIANT_LABELS[v] }))}
              />
            )}
            {mode === 'pack' && (
              <div className="flex items-center gap-1.5">
                {!isPack && packs.length > 1 && (
                  <select value={pickPack} onChange={e => { setPickPack(e.target.value); setPickCard(0); }} aria-label="Preview pack" className="rounded-md bg-gray-950 border border-gray-700 px-1.5 py-1 text-xs text-gray-200 max-w-[9rem]">
                    <option value="">First pack</option>
                    {packs.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                )}
                {previewCards.length > 0 && (
                  <select value={previewCard} onChange={e => setPickCard(Number(e.target.value))} aria-label="Preview card" className="rounded-md bg-gray-950 border border-gray-700 px-1.5 py-1 text-xs text-gray-200 max-w-[10rem]">
                    <option value={0}>Rarest card</option>
                    {previewCards.map(c => <option key={c.number} value={c.number}>#{c.number} {c.name}</option>)}
                  </select>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowSaved(v => !v)}
              disabled={!dirty}
              aria-pressed={showSaved}
              title="Flip the preview between your edit and what is saved"
              className={`px-2.5 py-1 rounded-md text-xs font-semibold border disabled:opacity-35 ${showSaved ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
            ><Icon name="eye" className="mr-1" />Before / after</button>
            <Popover label="Guides" icon="grid" up>
              <div className="w-64 space-y-3 text-sm">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={showThirds} onChange={e => setShowThirds(e.target.checked)} className="accent-yellow-400" />Rule of thirds</label>
                  <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} className="accent-yellow-400" />10% grid</label>
                  <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={showSafe} onChange={e => setShowSafe(e.target.checked)} className="accent-yellow-400" />Safe areas (5% and 10%)</label>
                  <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={snapOn} onChange={e => setSnapOn(e.target.checked)} className="accent-yellow-400" />Snap to centre / 10 px when dragging <span className="text-gray-600">(Alt = free)</span></label>
                </div>
                <label className="block text-xs text-gray-400 space-y-1">Zoom
                  <select value={zoom} onChange={e => setZoom(Number(e.target.value))} className="block w-full rounded-md bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm text-white">
                    <option value={1}>Fit to the space</option><option value={1.5}>150%</option><option value={2}>200%</option><option value={3}>300%</option>
                  </select>
                </label>
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-400">Background</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['checker', 'dark', 'light', 'green'] as Bg[]).map(b => (
                      <button key={b} type="button" aria-pressed={bg === b} onClick={() => setBg(b)} className={`px-2 py-1 rounded-md text-xs font-semibold border ${bg === b ? 'border-yellow-500 text-yellow-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>{b === 'checker' ? 'Checker' : b[0].toUpperCase() + b.slice(1)}</button>
                    ))}
                    {bgImage && <button type="button" aria-pressed={bg === 'image'} onClick={() => setBg('image')} className={`px-2 py-1 rounded-md text-xs font-semibold border ${bg === 'image' ? 'border-yellow-500 text-yellow-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>Screenshot</button>}
                  </div>
                  <label className={`${ghost} cursor-pointer inline-block text-xs`}>
                    Use a stream screenshot…
                    <input type="file" accept="image/*" className="sr-only" onChange={e => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      if (bgImage) URL.revokeObjectURL(bgImage);
                      setBgImage(URL.createObjectURL(f));
                      setBg('image');
                    }} />
                  </label>
                  <p className="text-[11px] text-gray-600">Only shown in this editor, never saved or uploaded.</p>
                </div>
              </div>
            </Popover>
            {(() => {
              const worst = VARIANT_IDS.map(v => ({ v, r: variantPerf(valueOf, v) })).sort((a, b) => b.r.score - a.r.score)[0];
              return (
                <span title={`${VARIANT_LABELS[worst.v]} is the heaviest version${worst.r.reasons.length ? ': ' + worst.r.reasons.join(', ') : ''}. A rough guide to how hard the overlay works in OBS.`} className={`text-[11px] font-bold rounded-full border px-2 py-0.5 ${PERF_STYLE[worst.r.level]}`}>
                  Load: {PERF_LABEL[worst.r.level]}
                </span>
              );
            })()}
            <button
              type="button"
              onClick={play}
              disabled={!ready || playing}
              className={`${btn} ml-auto bg-yellow-500 text-gray-950 hover:bg-yellow-400 disabled:opacity-40`}
            >
              {playing ? '… playing' : mode === 'pack' ? 'Play pack opening' : 'Play collection'}
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
                    if (g.id === 'pack' || g.id === 'variants') setMode('pack');
                    if (g.id === 'collection') setMode('collection');
                    if (g.id === 'variants') setVariantOpen(false);
                  }}
                  aria-current={active ? 'page' : undefined}
                  title={g.description}
                  className={`relative mx-1.5 rounded-lg py-2 flex flex-col items-center gap-0.5 text-[11px] font-semibold transition-colors ${active ? 'bg-yellow-500/15 text-yellow-300' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                >
                  <Icon name={g.icon} className="w-[1.15rem] h-[1.15rem]" />
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
                  <h3 className="font-semibold text-white text-sm"><Icon name={LAYOUT_CAT.icon} className="mr-1.5" />{LAYOUT_CAT.label}</h3>
                  <p className="text-xs text-gray-500 leading-snug">{LAYOUT_CAT.description}</p>
                </div>
              )}
              {!searching && !layoutCat && cat.id === 'variants' && variantOpen && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <button type="button" onClick={() => setVariantOpen(false)} className="text-gray-400 hover:text-white font-semibold">← Variants</button>
                    <span className="text-gray-600" aria-hidden>/</span>
                    <span className="font-bold text-yellow-300">{VARIANT_LABELS[version]}</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-snug rounded-md bg-yellow-500/10 border border-yellow-500/20 px-2 py-1.5">
                    Editing the <strong className="text-yellow-300">{VARIANT_LABELS[version]}</strong> card. The preview shows it.
                  </p>
                  {(() => {
                    const r = variantPerf(valueOf, version);
                    if (r.level === 'light' && r.reasons.length === 0) return null;
                    return (
                      <p className={`text-xs leading-snug rounded-md border px-2 py-1.5 ${PERF_STYLE[r.level]}`}>
                        <strong>{PERF_LABEL[r.level]} on OBS.</strong>{r.reasons.length > 0 ? ` ${r.reasons.join('; ')}. Consider turning these down if the overlay stutters.` : ' A fair amount of motion; fine for most setups.'}
                      </p>
                    );
                  })()}
                  <label className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    Copy the look of
                    <select
                      value=""
                      onChange={e => { if (e.target.value) copyVariant(e.target.value as VariantId); }}
                      className="rounded-md bg-gray-950 border border-gray-700 px-1.5 py-1 text-xs text-gray-200"
                    >
                      <option value="">choose a variant…</option>
                      {VARIANT_IDS.filter(v => v !== version).map(v => <option key={v} value={v}>{VARIANT_LABELS[v]}</option>)}
                    </select>
                    onto {VARIANT_LABELS[version]}
                  </label>
                </div>
              )}
              {!searching && !layoutCat && !variantPicker && !(cat.id === 'variants') && (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white text-sm"><Icon name={cat.icon} className="mr-1.5" />{cat.label}</h3>
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
              {!searching && !layoutCat && variantPicker && (
                <div className="min-w-0">
                  <h3 className="font-semibold text-white text-sm"><Icon name={cat.icon} className="mr-1.5" />{cat.label}</h3>
                  <p className="text-xs text-gray-500 leading-snug">{cat.description}</p>
                </div>
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
              ) : layoutCat ? layoutPanel : variantPicker ? variantPickerList : (
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
function Popover({ label, badge, children, align = 'left', up = false, icon, disabled = false }: { label: string; badge?: number; children: React.ReactNode; align?: 'left' | 'right'; up?: boolean; icon?: IconName; disabled?: boolean }) {
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
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-40 ${open ? 'border-yellow-500 text-yellow-300' : 'border-gray-700 text-gray-200 hover:border-gray-500'}`}
      >
        {icon && <Icon name={icon} className="mr-1.5" />}{label}{badge ? <span className="ml-1.5 text-xs text-gray-500">{badge}</span> : null} <span aria-hidden className="text-[10px] text-gray-500">▾</span>
      </button>
      {open && (
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} ${up ? 'bottom-full mb-2' : 'top-full mt-2'} z-40 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl p-3`}>
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
  const styleHelp = def.key === 'reveal.style' || /^variant.[a-z]+.style$/.test(def.key) ? REVEAL_STYLES.find(s => s.value === value)?.description : undefined;
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

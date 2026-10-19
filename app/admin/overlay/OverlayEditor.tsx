'use client';
import { Icon, type IconName } from '@/app/components/Icon';
import { PendingButton } from '../components/PendingButton';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  PROPS, PROP_BY_KEY, PROP_GROUPS, SECTION_ORDER, VARIANT_IDS, cleanValue, exportProps, importProps,
  type PropDef, type PropValue, type PropValues, type VariantId,
} from '@/lib/overlay-props';
import { DEFAULT_LAYOUT, sanitizeLayout, type OverlayLayout, type Placement } from '@/lib/overlay-layout';
import { MOMENT_IDS } from '@/lib/overlay-moments';
import { diffLayout, diffProps } from '@/lib/overlay-diff';
import { PERF_LABEL, variantPerf } from '@/lib/overlay-perf';
import { refreshOverlayAction } from '../overlay-actions';
import { Segmented, PropRow, btn } from './editor-controls';
import {
  PERF_STYLE, VARIANT_LABELS, dependsOn,
  type Bg, type CardInfo, type Mode, type MomentPick, type PackInfo, type PresetInfo, type SeasonInfo, type SidebarWindow, type Snap, type VersionInfo,
} from './editor-types';
import { GuidesMenu, ImportExportMenu, PackToolsMenu, PresetsMenu, ReviewMenu, SaveOptionsMenu, ScenesMenu, VersionsMenu } from './EditorMenus';
import { LayoutPanel } from './LayoutPanel';
import { VariantPicker } from './VariantPicker';
import { CategoryRail } from './CategoryRail';


// The Overlay Editor: one Photoshop-style workspace for where the overlay sits (Layout) and how it looks and moves. Everything is generated from the registry in
// lib/overlay-props.ts. Layout: an options bar (scope, presets, import/export, save) over a fixed canvas (the real overlay
// in an iframe, always fitted whole into the available space, never scrolling) and a docked properties panel (category
// rail, version tabs, collapsible sections, search). Values are stored sparsely; there are two scopes: Global and
// per-pack overrides. The preview is /overlay.html?preview fed the unsaved values by postMessage.


const canon = (v: PropValues) => JSON.stringify(Object.keys(v).sort().map(k => [k, v[k]]));
const eq = (a: PropValue | undefined, b: PropValue | undefined) => JSON.stringify(a) === JSON.stringify(b);
const snapKey = (x: Snap) => JSON.stringify([canon(x.g), Object.keys(x.p).sort().map(k => [k, canon(x.p[k])]), x.l]);
const sectionRank = (s: string) => { const i = SECTION_ORDER.indexOf(s); return i < 0 ? 99 : i; };

// "Layout" sits in the rail beside the registry's categories but isn't registry-driven: it edits the stage size and where each
// view is placed. Layout is global (not per pack), so it is hidden while editing a pack.
const LAYOUT_CAT: { id: string; label: string; icon: IconName; description: string } = { id: 'layout', label: 'Layout', icon: 'ruler', description: 'Where the overlay sits on your OBS browser source.' };


export function OverlayEditor({
  initialGlobal, initialPacks, packs, presets, initialLayout, initialScope, initialCategory, saveAction, savePresetAction, deletePresetAction,
  versions, seasons, seasonLooks, packCards, initialAutoReload, siteUrl, overlayKey,
}: {
  /** Where the overlay is served from (a scene's OBS URL is this + /overlay.html?preset=<id>). */
  siteUrl: string;
  /** The overlay key that goes in every OBS URL (lib/overlay-key.ts). */
  overlayKey: string;
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
  initialCategory?: string;
  saveAction: (formData: FormData) => void | Promise<void>;
  savePresetAction: (formData: FormData) => void | Promise<void>;
  deletePresetAction: (formData: FormData) => void | Promise<void>;
}) {
  const [globalVals, setGlobalVals] = useState<PropValues>(initialGlobal);
  // Scenes are presets with their own overlay URL. Their values live beside the pack overrides (key "scene:<id>") and their layouts
  // beside the global one, so one set of edit / undo / save machinery serves global, packs and scenes.
  const initialPackMap = useMemo<Record<string, PropValues>>(() => ({ ...initialPacks, ...Object.fromEntries(presets.map(x => ['scene:' + x.id, x.props])) }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const initialLayoutMap = useMemo<Record<string, OverlayLayout>>(() => ({ global: initialLayout, ...Object.fromEntries(presets.map(x => ['scene:' + x.id, x.layout ?? initialLayout])) }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [layoutMap, setLayoutMap] = useState<Record<string, OverlayLayout>>(initialLayoutMap);
  const [packVals, setPackVals] = useState<Record<string, PropValues>>(initialPackMap);
  const [scope, setScope] = useState<string>(initialScope === 'global' || packs.some(p => p.id === initialScope) || presets.some(x => 'scene:' + x.id === initialScope) ? initialScope : 'global');
  const isScene = scope.startsWith('scene:');
  const scene = isScene ? presets.find(x => 'scene:' + x.id === scope) ?? null : null;
  const layoutKey = isScene ? scope : 'global';
  // Raw while typing (so a half-typed size isn't clamped under the cursor); `layout` is the sanitized copy that is previewed and saved.
  const layoutVals = layoutMap[layoutKey] ?? layoutMap.global;
  const setLayoutVals = useCallback((u: OverlayLayout | ((l: OverlayLayout) => OverlayLayout)) =>
    setLayoutMap(m => ({ ...m, [layoutKey]: typeof u === 'function' ? u(m[layoutKey] ?? m.global) : u })), [layoutKey]);
  const layout = useMemo(() => sanitizeLayout(layoutVals), [layoutVals]);
  const initialActiveLayout = initialLayoutMap[layoutKey] ?? initialLayout;
  const [category, setCategory] = useState(initialCategory && (PROP_GROUPS.some(g => g.id === initialCategory) || initialCategory === 'layout') ? initialCategory : 'pack');
  const [version, setVersion] = useState<VariantId>('regular');   // the variant being edited AND previewed
  const [moment, setMoment] = useState<MomentPick>('');            // which special moment the preview plays
  const [showOff, setShowOff] = useState(false);                     // the canvas shows a chat show-off (placed like the pack opening)
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

  const isPack = scope !== 'global' && !isScene;       // editing one pack's overrides
  const isOver = scope !== 'global';                   // editing overrides of the global look (a pack or a scene)
  const current: PropValues = isOver ? packVals[scope] ?? {} : globalVals;

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
    if (isOver && globalVals[key] !== undefined) return globalVals[key];
    return def.default;
  }, [current, isOver, globalVals]);

  const setValue = (key: string, raw: unknown) => {
    const def = PROP_BY_KEY[key];
    const v = cleanValue(def, raw);
    if (v === undefined) return;
    if (!isOver) {
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
    if (!isOver) setGlobalVals(drop); else setPackVals(p => ({ ...p, [scope]: drop(p[scope] ?? {}) }));
  };
  const replaceCurrent = (next: PropValues) => {
    if (!isOver) setGlobalVals(next); else setPackVals(p => ({ ...p, [scope]: next }));
  };

  // ── Undo / redo: every edit (a drag or a slider burst counts as one) is a step; Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y ──
  const stateRef = useRef<Snap>({ g: globalVals, p: packVals, l: layoutMap });
  stateRef.current = { g: globalVals, p: packVals, l: layoutMap };
  const hist = useRef<{ list: Snap[]; i: number; timer: ReturnType<typeof setTimeout> | null; skip: boolean }>({
    list: [{ g: initialGlobal, p: initialPackMap, l: initialLayoutMap }], i: 0, timer: null, skip: false,
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
  }, [globalVals, packVals, layoutMap, commit]);
  const restoreSnap = (x: Snap) => { hist.current.skip = true; setGlobalVals(x.g); setPackVals(x.p); setLayoutMap(x.l); bump(n => n + 1); };
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
  const keys = (m: Record<string, unknown>) => Object.keys(m);
  const changedPacks = keys({ ...initialPackMap, ...packVals }).filter(id => !id.startsWith('scene:') && canon(packVals[id] ?? {}) !== canon(initialPackMap[id] ?? {}));
  const layoutOf = (k: string) => sanitizeLayout(layoutMap[k] ?? layoutMap.global);
  const changedLayout = JSON.stringify(layoutOf('global')) !== JSON.stringify(initialLayout);
  // Scenes: a scene is saved when its values or its layout changed.
  const changedScenes = presets.filter(x => {
    const k = 'scene:' + x.id;
    return canon(packVals[k] ?? {}) !== canon(initialPackMap[k] ?? {}) || JSON.stringify(layoutOf(k)) !== JSON.stringify(sanitizeLayout(initialLayoutMap[k]));
  });
  const dirty = changedGlobal || changedPacks.length > 0 || changedLayout || changedScenes.length > 0;
  const payload = JSON.stringify({
    ...(changedLayout ? { layout: layoutOf('global') } : {}),
    ...(changedGlobal ? { global: globalVals } : {}),
    packs: Object.fromEntries(changedPacks.map(id => [id, packVals[id] ?? {}])),
    scenes: Object.fromEntries(changedScenes.map(x => [x.id, { props: packVals['scene:' + x.id] ?? {}, layout: layoutOf('scene:' + x.id) }])),
  });
  const revert = () => { setGlobalVals(initialGlobal); setPackVals(initialPackMap); setLayoutMap(initialLayoutMap); };
  // Review changes: every setting that differs from what is saved.
  const diffs = [
    ...diffLayout(initialLayout, layoutOf('global')),
    ...diffProps('Everything', initialGlobal, globalVals, k => PROP_BY_KEY[k]?.default),
    ...changedPacks.flatMap(id => diffProps(`Pack: ${packs.find(x => x.id === id)?.name ?? id}`, initialPacks[id] ?? {}, packVals[id] ?? {}, () => '(follows global)')),
    ...changedScenes.flatMap(x => [
      ...diffLayout(sanitizeLayout(initialLayoutMap['scene:' + x.id]), layoutOf('scene:' + x.id)).map(d => ({ ...d, scope: `Scene: ${x.name}` })),
      ...diffProps(`Scene: ${x.name}`, initialPackMap['scene:' + x.id] ?? {}, packVals['scene:' + x.id] ?? {}, () => '(follows global)'),
    ]),
  ];
  useEffect(() => { if (!dirty) setShowSaved(false); }, [dirty]);
  const shownLayout = showSaved ? initialActiveLayout : layout;
  const savedEffective: PropValues = isOver ? { ...initialGlobal, ...(initialPackMap[scope] ?? {}) } : initialGlobal;
  const versionDistance = (v: VersionInfo) =>
    diffLayout(v.layout, layout).length +
    diffProps('', v.props, globalVals, k => PROP_BY_KEY[k]?.default).length +
    [...new Set([...Object.keys(v.packs), ...Object.keys(packVals)])].reduce((n, id) => n + diffProps('', v.packs[id] ?? {}, packVals[id] ?? {}, () => '(follows global)').length, 0);
  const loadVersion = (v: VersionInfo) => {
    setGlobalVals(v.props); setPackVals(m => ({ ...Object.fromEntries(Object.entries(m).filter(([k]) => k.startsWith('scene:'))), ...v.packs })); setLayoutMap(m => ({ ...m, global: v.layout }));
    setNotice(`Loaded the version from ${new Date(v.at).toLocaleString('en-GB', { timeZone: 'UTC' })}. Review, then Save.`);
  };

  // The values that apply at this scope, sparse: what the preview shows and what export/presets capture.
  const effectiveSparse: PropValues = useMemo(() => (isOver ? { ...globalVals, ...(packVals[scope] ?? {}) } : globalVals), [isOver, globalVals, packVals, scope]);
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
  useEffect(() => { if (ready) post({ type: 'static', mode, showoff: showOff }); }, [ready, loadedCount, mode, showOff, post]);

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
    post(showOff && mode === 'pack' ? { type: 'showoff' } : { type: mode, moment: mode === 'pack' ? moment : undefined });
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
      if (!isOver && eq(v, d.default)) delete next[d.key]; else next[d.key] = v;
    }
    replaceCurrent(next);
    setNotice(`Copied the ${VARIANT_LABELS[from]} look onto ${VARIANT_LABELS[version]}. Review, then Save.`);
  };

  const renderRow = (def: PropDef) => {
    const dep = dependsOn(def.key);
    const off = dep ? !dep.when(valueOf(dep.key)) : false;
    return (
      <PropRow
        key={def.key}
        def={def}
        value={valueOf(def.key)}
        modified={current[def.key] !== undefined}
        inherited={isOver && current[def.key] === undefined && globalVals[def.key] !== undefined}
        isPack={isOver}
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
              title={isOver ? 'Clear the overrides in this section' : 'Reset this section to the defaults'}
            >
              {isOver ? 'inherit' : 'reset'}
            </button>
          )}
        </div>
        {open && <div className="px-3 pb-4 pt-1 space-y-4">{defs.map(renderRow)}</div>}
      </section>
    );
  };

  // ── Layout (stage size + where each view sits) ──
  const placement = layout[mode];
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
        setShowOff(c === 'showoff');
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
        case 'showlabel': go('showoff', 'Label'); break;
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

  const variantPickerList = (
    <VariantPicker valueOf={valueOf} current={current} version={version} onPick={v => { setVersion(v); setVariantOpen(true); setMode('pack'); }} />
  );


  const viewName = mode === 'pack' ? 'pack opening' : 'collection view';
  const layoutPanel = (
    <LayoutPanel
      layout={layout} layoutVals={layoutVals} isScene={isScene} sceneName={scene?.name ?? ''} isPack={isPack} mode={mode} setMode={setMode}
      setLayoutVals={setLayoutVals} setPlacement={setPlacement} setValue={setValue} setNotice={setNotice}
    />
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
            className="select select-sm max-w-56"
          >
            <option value="global">Everything (global)</option>
            {packs.map(p => (
              <option key={p.id} value={p.id}>Pack: {p.name}{Object.keys(packVals[p.id] ?? {}).length ? ' ●' : ''}</option>
            ))}
            {presets.length > 0 && (
              <optgroup label="Scenes (own overlay URL)">
                {presets.map(x => <option key={x.id} value={'scene:' + x.id}>Scene: {x.name}</option>)}
              </optgroup>
            )}
          </select>
        </label>
        {isPack && <span className="text-xs text-yellow-300/80 hidden md:inline">Only what you change applies to this pack; the rest follows global.</span>}
        {isScene && <span className="text-xs text-sky-300/80 hidden md:inline">This scene has its own overlay URL and layout; only what you change differs from the global look.</span>}

        <PresetsMenu
          presets={presets} isPack={isPack} scope={scope} dirty={dirty} effectiveSparse={effectiveSparse} applyPreset={applyPreset}
          deletePresetAction={deletePresetAction} savePresetAction={savePresetAction} presetName={presetName} setPresetName={setPresetName}
          seasons={seasons} looks={looks} setLooks={setLooks} setNotice={setNotice}
        />

        <ScenesMenu
          presets={presets} initialLayout={initialLayout} globalLayout={layoutOf('global')} siteUrl={siteUrl} overlayKey={overlayKey}
          scope={scope} setScope={setScope} setNotice={setNotice} savePresetAction={savePresetAction} presetName={presetName} setPresetName={setPresetName} dirty={dirty}
        />

        <VersionsMenu versionList={versionList} setVersionList={setVersionList} versionDistance={versionDistance} loadVersion={loadVersion} />

        <ImportExportMenu
          download={download} copyJson={copyJson} runImport={runImport} importText={importText} setImportText={setImportText}
          importError={importError} setImportError={setImportError}
        />

        {isPack && (
          <PackToolsMenu
            packs={packs} packVals={packVals} setPackVals={setPackVals} scope={scope} globalVals={globalVals} copyTargets={copyTargets}
            setCopyTargets={setCopyTargets} copyFrom={copyFrom} setCopyFrom={setCopyFrom} replaceCurrent={replaceCurrent} setNotice={setNotice}
          />
        )}


        <div className="flex items-center gap-1" role="group" aria-label="History">
          <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" className="p-2 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-35"><Icon name="undo" /></button>
          <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" className="p-2 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-35"><Icon name="redo" /></button>
        </div>

        <span role="status" className="flex-1 min-w-0 truncate text-xs text-green-300 px-2">{notice}</span>

        <span className="text-xs text-gray-500 hidden md:inline">
          {dirty
            ? <span className="text-yellow-500">Unsaved: {[changedLayout && 'layout', changedGlobal && 'look', ...changedPacks.map(id => packs.find(p => p.id === id)?.name ?? id), ...changedScenes.map(x => `scene ${x.name}`)].filter(Boolean).join(', ')}</span>
            : 'Saved.'}
        </span>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => startRefresh(async () => { const r = await refreshOverlayAction(); setNotice(r.message); })}
          title="Ask every open overlay (OBS) to reload the saved look"
          className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-700 text-gray-200 hover:border-gray-500 disabled:opacity-50"
        ><Icon name="refresh" className={`mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />Refresh overlay</button>

        <ReviewMenu diffs={diffs} dirty={dirty} />

        <form action={saveAction} className="flex items-center gap-2">
          <input type="hidden" name="payload" value={payload} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="note" value={note} />
          <input type="hidden" name="autoReload" value={autoReload ? 'on' : ''} />
          <button type="button" disabled={!dirty} onClick={revert} className={`${btn} text-gray-400 hover:text-white disabled:opacity-40`}>Revert</button>
          <PendingButton type="submit" disabled={!dirty} className={`${btn} bg-yellow-500 text-gray-950 hover:bg-yellow-400 disabled:opacity-40`}>Save</PendingButton>
        </form>
        <SaveOptionsMenu note={note} setNote={setNote} autoReload={autoReload} setAutoReload={setAutoReload} />
      </div>

      <div className="flex-1 min-h-0 grid gap-3 xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* ── Canvas ── */}
        <div className="min-h-0 min-w-0 flex flex-col gap-2">
          <div
            ref={boxRef}
            className="relative flex-1 min-h-64 h-[55vh] xl:h-auto rounded-xl border border-gray-800 bg-gray-950/70 overflow-auto flex"
          >
            <div
              className="relative overflow-hidden rounded-md border border-gray-700 shrink-0 m-auto outline-hidden focus-visible:border-yellow-500"
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
                  <div aria-hidden className="absolute inset-[5%] border border-dashed border-amber-300/50 pointer-events-none"><span className="absolute top-0 left-1 text-[9px] text-amber-300/70">action safe</span></div>
                  <div aria-hidden className="absolute inset-[10%] border border-dashed border-rose-300/50 pointer-events-none"><span className="absolute top-0 left-1 text-[9px] text-rose-300/70">title safe</span></div>
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
              value={showOff && mode === 'pack' ? 'showoff' : mode}
              onChange={v => {
                setShowOff(v === 'showoff');
                setMode(v === 'collection' ? 'collection' : 'pack');
                if (v === 'showoff') setCategory('showoff');
                else if (!isPack && category !== 'layout') setCategory(v === 'collection' ? 'collection' : category === 'collection' || category === 'showoff' ? 'pack' : category);
              }}
              options={[{ id: 'pack', label: 'Pack opening' }, { id: 'showoff', label: 'Show off' }, { id: 'collection', label: 'Collection' }]}
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
            {mode === 'pack' && !showOff && (
              <Segmented
                label="Moment"
                value={moment}
                onChange={v => setMoment(v as MomentPick)}
                options={[{ id: '', label: 'None' }, ...MOMENT_IDS.map(m => ({ id: m, label: m === 'firstEver' ? 'First-ever' : m === 'firstPull' ? 'First pull' : 'New card' }))]}
              />
            )}
            {mode === 'pack' && (
              <div className="flex items-center gap-1.5">
                {!isPack && packs.length > 1 && (
                  <select value={pickPack} onChange={e => { setPickPack(e.target.value); setPickCard(0); }} aria-label="Preview pack" className="select select-sm max-w-36">
                    <option value="">First pack</option>
                    {packs.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                )}
                {previewCards.length > 0 && (
                  <select value={previewCard} onChange={e => setPickCard(Number(e.target.value))} aria-label="Preview card" className="select select-sm max-w-40">
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
            <GuidesMenu
              showThirds={showThirds} setShowThirds={setShowThirds} showGrid={showGrid} setShowGrid={setShowGrid} showSafe={showSafe} setShowSafe={setShowSafe}
              snapOn={snapOn} setSnapOn={setSnapOn} zoom={zoom} setZoom={setZoom} bg={bg} setBg={setBg} bgImage={bgImage} setBgImage={setBgImage}
            />
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
              {playing ? '… playing' : mode === 'collection' ? 'Play collection' : showOff ? 'Play show off' : 'Play pack opening'}
            </button>
          </div>
        </div>

        {/* ── Properties dock ── */}
        <div className="min-h-0 flex rounded-xl border border-gray-800 bg-gray-900/80 overflow-hidden h-[75vh] xl:h-auto">
          <CategoryRail
            rail={rail}
            countOf={id => (id === 'layout' ? layoutMoved : modifiedCount(id))}
            activeId={searching ? null : layoutCat ? 'layout' : cat.id}
            onSelect={id => {
              setCategory(id);
              setQuery('');
              if (id === 'pack' || id === 'variants' || id === 'moments' || id === 'showoff') setMode('pack');
              setShowOff(id === 'showoff');
              if (id === 'collection') setMode('collection');
              if (id === 'variants') setVariantOpen(false);
            }}
          />

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="p-3 space-y-2 border-b border-gray-800">
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search every setting…"
                aria-label="Search settings"
                className="input input-sm w-full"
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
                      className="select select-sm"
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

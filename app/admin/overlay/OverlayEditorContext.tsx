'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  PROPS,
  PROP_BY_KEY,
  PROP_GROUPS,
  SECTION_ORDER,
  cleanValue,
  exportProps,
  importProps,
  type PropDef,
  type PropValue,
  type PropValues,
  type VariantId,
} from '@/lib/overlay-props';
import { DEFAULT_LAYOUT, sanitizeLayout, type ElementId, type OverlayLayout, type Placement } from '@/lib/overlay-layout';
import { diffLayout, diffProps, type DiffLine } from '@/lib/overlay-diff';
import {
  VARIANT_LABELS,
  type Bg,
  type CardInfo,
  type Mode,
  type MomentPick,
  type PackInfo,
  type PresetInfo,
  type SeasonInfo,
  type SidebarWindow,
  type Snap,
  type VersionInfo,
} from './editor-types';

const canon = (v: PropValues) => JSON.stringify(Object.keys(v).sort().map(k => [k, v[k]]));
const eq = (a: PropValue | undefined, b: PropValue | undefined) => JSON.stringify(a) === JSON.stringify(b);
const DRAFT_KEY = 'overlay-editor-draft';
const snapKey = (x: Snap) => JSON.stringify([canon(x.g), Object.keys(x.p).sort().map(k => [k, canon(x.p[k])]), x.l]);
// Preview element (data-edit) -> the category and section that edit it; read both ways.
const TARGET_SECTIONS: Record<string, [string, string?]> = {
  card: ['variants'],
  label: ['variants', 'Label'],
  bar: ['pack', 'Name and stars bar'],
  got: ['pack', '"got:" line'],
  showlabel: ['showoff', 'Label'],
  strip: ['pack', 'Cards under the card'],
  heading: ['collection', 'What to show'],
  serial: ['variants', 'Label'],
  grid: ['collection', 'Layout'],
};
/** The category and section (if any) that edit a preview element. */
export const sectionForTarget = (target: string) => TARGET_SECTIONS[target];
/** The preview element a panel section edits, or '' (section keys look like `pack/Label` or `variants.shiny/Label`). */
export const targetForSection = (sectionKey: string) => {
  const [cat, name] = sectionKey.split('/');
  const c = cat.split('.')[0];
  return Object.keys(TARGET_SECTIONS).find(t => TARGET_SECTIONS[t][0] === c && TARGET_SECTIONS[t][1] === name) ?? '';
};
const sectionRank = (s: string) => {
  const i = SECTION_ORDER.indexOf(s);
  return i < 0 ? 99 : i;
};

/** The right-click menu on a layer: `id` null = the whole view; x / y are screen pixels. */
export interface LayerMenuState { view: Mode; id: string | null; x: number; y: number }

export interface OverlayEditorProps {
  siteUrl: string;
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
  saveAction: (formData: FormData) => Promise<{ conflict: VersionInfo } | void>;
  savePresetAction: (formData: FormData) => void | Promise<void>;
  deletePresetAction: (formData: FormData) => void | Promise<void>;
}

export interface OverlayEditorContextValue {
  // Config & Props
  siteUrl: string;
  overlayKey: string;
  packs: PackInfo[];
  presets: PresetInfo[];
  seasons: SeasonInfo[];
  packCards: Record<string, CardInfo[]>;
  initialLayout: OverlayLayout;
  saveAction: (formData: FormData) => Promise<void>;
  /** The newest saved version the editor loaded, sent with Save; a newer one on the server is a conflict. */
  knownVersion: string;
  /** Set when the last Save was refused because someone saved a newer version. */
  conflict: VersionInfo | null;
  versionDiffs: (v: VersionInfo) => DiffLine[];
  overwrite: () => void;
  loadTheirs: () => void;
  savePresetAction: (formData: FormData) => void | Promise<void>;
  deletePresetAction: (formData: FormData) => void | Promise<void>;

  // Scopes & Status
  scope: string;
  setScope: (s: string) => void;
  isPack: boolean;
  isScene: boolean;
  isOver: boolean;
  scene: PresetInfo | null;
  dirty: boolean;
  payload: string;
  revert: () => void;
  /** An unsaved draft found in localStorage on open (null once restored or discarded); stale = made against an older saved version. */
  draftOffer: { at: number; stale: boolean } | null;
  restoreDraft: () => void;
  discardDraft: () => void;
  /** Bumped to open the Review popover. */
  reviewSignal: number;
  openReview: () => void;
  /** When the newest saved version was made (ms), null before the first save. */
  lastSavedAt: number | null;
  /** Bumped by Help to show the first-use hint on the canvas again. */
  hintSignal: number;
  showHint: () => void;
  notice: string;
  setNotice: (n: string) => void;
  refreshing: boolean;
  startRefresh: (fn: () => Promise<void>) => void;
  changedLayout: boolean;
  changedGlobal: boolean;
  changedPacks: string[];
  changedScenes: PresetInfo[];
  diffs: DiffLine[];

  // Layout & Placement
  layout: OverlayLayout;
  layoutVals: OverlayLayout;
  setLayoutVals: (u: OverlayLayout | ((l: OverlayLayout) => OverlayLayout)) => void;
  setPlacement: (patch: Partial<Placement> | ((p: Placement) => Partial<Placement>)) => void;
  layoutMoved: number;
  placement: Placement;
  layoutCat: boolean;
  dragging: boolean;
  selected: string;
  selectTarget: (target: string) => void;
  selectView: (view: Mode) => void;
  hoverElement: (target: string) => void;
  layerMenu: LayerMenuState | null;
  openLayerMenu: (view: Mode, id: string | null, x: number, y: number) => void;
  closeLayerMenu: () => void;
  resetLayer: (view: Mode, id: string | null) => void;
  centerLayer: (view: Mode) => void;
  copyLayerToScenes: (view: Mode, id: string | null) => void;
  sceneCount: number;
  layoutOf: (k: string) => OverlayLayout;

  // Navigation & Category
  category: string;
  setCategory: (c: string) => void;
  catId: string;
  version: VariantId;
  setVersion: (v: VariantId) => void;
  variantOpen: boolean;
  setVariantOpen: (o: boolean) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  moment: MomentPick;
  setMoment: (m: MomentPick) => void;
  showOff: boolean;
  setShowOff: (s: boolean) => void;
  query: string;
  setQuery: (q: string) => void;
  searching: boolean;
  openMap: Record<string, boolean>;
  setOpenMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setSelected: (target: string) => void;

  // View tools & Stage
  boxRef: RefObject<HTMLDivElement | null>;
  frameRef: RefObject<HTMLIFrameElement | null>;
  fit: number;
  frameW: number;
  frameH: number;
  shownLayout: OverlayLayout;
  ready: boolean;
  setReady: (r: boolean) => void;
  setLoadedCount: React.Dispatch<React.SetStateAction<number>>;
  playing: boolean;
  play: () => void;
  showGrid: boolean;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  showThirds: boolean;
  setShowThirds: React.Dispatch<React.SetStateAction<boolean>>;
  showSafe: boolean;
  setShowSafe: React.Dispatch<React.SetStateAction<boolean>>;
  snapOn: boolean;
  setSnapOn: React.Dispatch<React.SetStateAction<boolean>>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  bg: Bg;
  setBg: React.Dispatch<React.SetStateAction<Bg>>;
  bgImage: string | null;
  setBgImage: React.Dispatch<React.SetStateAction<string | null>>;
  showSaved: boolean;
  setShowSaved: React.Dispatch<React.SetStateAction<boolean>>;
  pickPack: string;
  setPickPack: (p: string) => void;
  pickCard: number;
  setPickCard: (c: number) => void;
  previewCards: CardInfo[];
  previewCard: number;
  onKeyDown: (e: React.KeyboardEvent) => void;

  // History & Presets
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  presetName: string;
  setPresetName: (n: string) => void;
  importText: string;
  setImportText: (t: string) => void;
  importError: string;
  setImportError: (e: string) => void;
  download: () => void;
  copyJson: () => Promise<void>;
  runImport: (t: string) => void;
  applyPreset: (p: PresetInfo) => void;
  versionList: VersionInfo[];
  setVersionList: React.Dispatch<React.SetStateAction<VersionInfo[]>>;
  versionDistance: (v: VersionInfo) => number;
  loadVersion: (v: VersionInfo) => void;
  looks: Record<string, string>;
  setLooks: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  note: string;
  setNote: (n: string) => void;
  autoReload: boolean;
  setAutoReload: (a: boolean) => void;
  copyTargets: string[];
  setCopyTargets: React.Dispatch<React.SetStateAction<string[]>>;
  copyFrom: string;
  setCopyFrom: (s: string) => void;
  replaceCurrent: (next: PropValues) => void;
  copyVariant: (from: VariantId) => void;
  packVals: Record<string, PropValues>;
  setPackVals: React.Dispatch<React.SetStateAction<Record<string, PropValues>>>;
  globalVals: PropValues;

  // Properties & Values
  current: PropValues;
  valueOf: (key: string) => PropValue;
  setValue: (key: string, raw: unknown) => void;
  resetKeys: (keys: string[]) => void;
  effectiveSparse: PropValues;
  modifiedCount: (cat: string) => number;
  defsFor: (cat: string) => PropDef[];
  groupSections: (defs: PropDef[]) => [string, PropDef[]][];
  matches: (d: PropDef) => boolean;
  hiddenInScope: (d: PropDef) => boolean;
}

const OverlayEditorContext = createContext<OverlayEditorContextValue | null>(null);

export function useOverlayEditor() {
  const ctx = useContext(OverlayEditorContext);
  if (!ctx) throw new Error('useOverlayEditor must be used within an OverlayEditorProvider');
  return ctx;
}

export function OverlayEditorProvider({
  children,
  initialGlobal,
  initialPacks,
  packs,
  presets,
  initialLayout,
  initialScope,
  initialCategory,
  saveAction,
  savePresetAction,
  deletePresetAction,
  versions,
  seasons,
  seasonLooks,
  packCards,
  initialAutoReload,
  siteUrl,
  overlayKey,
}: OverlayEditorProps & { children: ReactNode }) {
  const [globalVals, setGlobalVals] = useState<PropValues>(initialGlobal);
  const initialPackMap = useMemo<Record<string, PropValues>>(
    () => ({ ...initialPacks, ...Object.fromEntries(presets.map(x => ['scene:' + x.id, x.props])) }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const initialLayoutMap = useMemo<Record<string, OverlayLayout>>(
    () => ({ global: initialLayout, ...Object.fromEntries(presets.map(x => ['scene:' + x.id, x.layout ?? initialLayout])) }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [layoutMap, setLayoutMap] = useState<Record<string, OverlayLayout>>(initialLayoutMap);
  const [packVals, setPackVals] = useState<Record<string, PropValues>>(initialPackMap);
  const [scope, setScope] = useState<string>(
    initialScope === 'global' || packs.some(p => p.id === initialScope) || presets.some(x => 'scene:' + x.id === initialScope)
      ? initialScope
      : 'global',
  );

  const isScene = scope.startsWith('scene:');
  const scene = isScene ? presets.find(x => 'scene:' + x.id === scope) ?? null : null;
  const layoutKey = isScene ? scope : 'global';
  const layoutVals = layoutMap[layoutKey] ?? layoutMap.global;
  const setLayoutVals = useCallback(
    (u: OverlayLayout | ((l: OverlayLayout) => OverlayLayout)) =>
      setLayoutMap(m => ({ ...m, [layoutKey]: typeof u === 'function' ? u(m[layoutKey] ?? m.global) : u })),
    [layoutKey],
  );
  const layout = useMemo(() => sanitizeLayout(layoutVals), [layoutVals]);
  const initialActiveLayout = initialLayoutMap[layoutKey] ?? initialLayout;

  const [category, setCategory] = useState(
    initialCategory && (PROP_GROUPS.some(g => g.id === initialCategory) || initialCategory === 'layout')
      ? initialCategory
      : 'pack',
  );
  const [version, setVersion] = useState<VariantId>('regular');
  const [moment, setMoment] = useState<MomentPick>('');
  const [showOff, setShowOff] = useState(false);
  const [mode, setMode] = useState<Mode>('pack');
  const [variantOpen, setVariantOpen] = useState(false);
  const [focusKey, setFocusKey] = useState('');
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
  // A drag or a corner-handle resize in progress (one undo step): `s0` is the scale a resize started from.
  const drag = useRef<{ view: Mode; id: string | null; ox: number; oy: number; s0?: number } | null>(null);
  const [selected, setSelected] = useState('');
  const [layerMenu, setLayerMenu] = useState<LayerMenuState | null>(null);

  const [zoom, setZoom] = useState(1);
  const [showThirds, setShowThirds] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showSafe, setShowSafe] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [bg, setBg] = useState<Bg>('checker');
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [pickPack, setPickPack] = useState('');
  const [pickCard, setPickCard] = useState(0);
  const [versionList, setVersionList] = useState(versions);
  const [knownVersion, setKnownVersion] = useState(versions[0]?.id ?? '');
  const [conflict, setConflict] = useState<VersionInfo | null>(null);
  useEffect(() => { setKnownVersion(versions[0]?.id ?? ''); }, [versions]);
  const [looks, setLooks] = useState(seasonLooks);
  const [note, setNote] = useState('');
  const [autoReload, setAutoReload] = useState(initialAutoReload);
  const [refreshing, startRefresh] = useTransition();
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [copyFrom, setCopyFrom] = useState('');

  const isPack = scope !== 'global' && !isScene;
  const isOver = scope !== 'global';
  const current: PropValues = isOver ? packVals[scope] ?? {} : globalVals;

  useEffect(() => {
    const w = window as SidebarWindow;
    w.__tcgSidebarForce = true;
    window.dispatchEvent(new CustomEvent('tcg:sidebar', { detail: true }));
    return () => {
      w.__tcgSidebarForce = false;
      window.dispatchEvent(new CustomEvent('tcg:sidebar', { detail: false }));
    };
  }, []);

  const valueOf = useCallback(
    (key: string): PropValue => {
      const def = PROP_BY_KEY[key];
      if (current[key] !== undefined) return current[key];
      if (isOver && globalVals[key] !== undefined) return globalVals[key];
      return def.default;
    },
    [current, isOver, globalVals],
  );

  const setValue = (key: string, raw: unknown) => {
    const def = PROP_BY_KEY[key];
    const v = cleanValue(def, raw);
    if (v === undefined) return;
    if (!isOver) {
      setGlobalVals(g => {
        const next = { ...g };
        if (eq(v, def.default)) delete next[key];
        else next[key] = v;
        return next;
      });
    } else {
      setPackVals(p => {
        const own = { ...(p[scope] ?? {}) };
        const inherited = globalVals[key] !== undefined ? globalVals[key] : def.default;
        if (eq(v, inherited)) delete own[key];
        else own[key] = v;
        return { ...p, [scope]: own };
      });
    }
  };

  const resetKeys = (keys: string[]) => {
    const drop = (m: PropValues) => {
      const n = { ...m };
      keys.forEach(k => delete n[k]);
      return n;
    };
    if (!isOver) setGlobalVals(drop);
    else setPackVals(p => ({ ...p, [scope]: drop(p[scope] ?? {}) }));
  };

  const replaceCurrent = (next: PropValues) => {
    if (!isOver) setGlobalVals(next);
    else setPackVals(p => ({ ...p, [scope]: next }));
  };

  // Undo / redo
  const stateRef = useRef<Snap>({ g: globalVals, p: packVals, l: layoutMap });
  stateRef.current = { g: globalVals, p: packVals, l: layoutMap };
  const hist = useRef<{ list: Snap[]; i: number; timer: ReturnType<typeof setTimeout> | null; skip: boolean }>({
    list: [{ g: initialGlobal, p: initialPackMap, l: initialLayoutMap }],
    i: 0,
    timer: null,
    skip: false,
  });
  const [, bump] = useState(0);

  const commit = useCallback(() => {
    const h = hist.current;
    if (h.timer) {
      clearTimeout(h.timer);
      h.timer = null;
    }
    const cur = stateRef.current;
    if (snapKey(cur) === snapKey(h.list[h.i])) return;
    h.list = [...h.list.slice(0, h.i + 1), cur].slice(-60);
    h.i = h.list.length - 1;
    bump(n => n + 1);
  }, []);

  useEffect(() => {
    const h = hist.current;
    if (h.skip) {
      h.skip = false;
      return;
    }
    if (drag.current) return; // a drag is one step: committed when it ends
    if (h.timer) clearTimeout(h.timer);
    h.timer = setTimeout(commit, 500);
  }, [globalVals, packVals, layoutMap, commit]);

  const restoreSnap = (x: Snap) => {
    hist.current.skip = true;
    setGlobalVals(x.g);
    setPackVals(x.p);
    setLayoutMap(x.l);
    bump(n => n + 1);
  };

  const undo = () => {
    commit();
    const h = hist.current;
    if (h.i > 0) {
      h.i--;
      restoreSnap(h.list[h.i]);
    }
  };

  const redo = () => {
    commit();
    const h = hist.current;
    if (h.i < h.list.length - 1) {
      h.i++;
      restoreSnap(h.list[h.i]);
    }
  };

  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;
  const canUndo = hist.current.i > 0 || snapKey(stateRef.current) !== snapKey(hist.current.list[hist.current.i]);
  const canRedo = hist.current.i < hist.current.list.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'TEXTAREA' ||
          (t.tagName === 'INPUT' && ['text', 'search', 'number', 'url', ''].includes((t as HTMLInputElement).type)))
      )
        return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoRef.current();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redoRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const changedGlobal = canon(globalVals) !== canon(initialGlobal);
  const keys = (m: Record<string, unknown>) => Object.keys(m);
  const changedPacks = keys({ ...initialPackMap, ...packVals }).filter(
    id => !id.startsWith('scene:') && canon(packVals[id] ?? {}) !== canon(initialPackMap[id] ?? {}),
  );
  const layoutOf = useCallback(
    (k: string) => sanitizeLayout(layoutMap[k] ?? layoutMap.global),
    [layoutMap],
  );
  const changedLayout = JSON.stringify(layoutOf('global')) !== JSON.stringify(initialLayout);
  const changedScenes = presets.filter(x => {
    const k = 'scene:' + x.id;
    return (
      canon(packVals[k] ?? {}) !== canon(initialPackMap[k] ?? {}) ||
      JSON.stringify(layoutOf(k)) !== JSON.stringify(sanitizeLayout(initialLayoutMap[k]))
    );
  });
  const dirty = changedGlobal || changedPacks.length > 0 || changedLayout || changedScenes.length > 0;
  const payload = JSON.stringify({
    ...(changedLayout ? { layout: layoutOf('global') } : {}),
    ...(changedGlobal ? { global: globalVals } : {}),
    packs: Object.fromEntries(changedPacks.map(id => [id, packVals[id] ?? {}])),
    scenes: Object.fromEntries(
      changedScenes.map(x => [x.id, { props: packVals['scene:' + x.id] ?? {}, layout: layoutOf('scene:' + x.id) }]),
    ),
  });

  const revert = () => {
    setGlobalVals(initialGlobal);
    setPackVals(initialPackMap);
    setLayoutMap(initialLayoutMap);
  };

  // Unsaved draft recovery: the whole editor state (global, packs, scenes, layouts) is kept in one localStorage entry, 1s after the last
  // change, while there is anything unsaved; it is dropped as soon as the editor is clean again (Save, Revert, Discard).
  // `base` is the newest saved version id the draft was made against. Storage may be blocked, so every access is guarded.
  const baseVersion = versions[0]?.id ?? '';
  const [draftOffer, setDraftOffer] = useState<{ at: number; stale: boolean; snap: Snap } | null>(null);
  const [draftChecked, setDraftChecked] = useState(false); // storage is only written once the stored draft has been read
  const [reviewSignal, setReviewSignal] = useState(0);
  const [hintSignal, setHintSignal] = useState(0);
  const storeDraft = (v: { base: string; at: number; snap: Snap } | null) => {
    try { if (v) localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); else localStorage.removeItem(DRAFT_KEY); } catch { /* storage blocked */ }
  };
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
      if (!d?.snap?.g || !d.snap.p || !d.snap.l || typeof d.at !== 'number') return;
      // A draft that already matches what is saved (it was saved just before the page closed) is not worth offering.
      if (snapKey(d.snap) === snapKey({ g: initialGlobal, p: initialPackMap, l: initialLayoutMap })) { storeDraft(null); return; }
      setDraftOffer({ at: d.at, stale: d.base !== baseVersion, snap: d.snap });
    } catch { /* storage blocked or a corrupt draft */ } finally { setDraftChecked(true); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!draftChecked || draftOffer) return; // an unanswered offer is kept as it is
    if (!dirty) { storeDraft(null); return; }
    const t = setTimeout(() => storeDraft({ base: baseVersion, at: Date.now(), snap: { g: globalVals, p: packVals, l: layoutMap } }), 1000);
    return () => clearTimeout(t);
  }, [dirty, draftChecked, draftOffer, globalVals, packVals, layoutMap, baseVersion]);
  const restoreDraft = () => {
    if (!draftOffer) return;
    const { snap, stale } = draftOffer;
    // Drop what no longer exists (a deleted pack or scene) so it can't be saved back.
    const live = (k: string) => (k.startsWith('scene:') ? presets.some(x => 'scene:' + x.id === k) : k === 'global' || packs.some(x => x.id === k));
    setGlobalVals(snap.g);
    setPackVals(Object.fromEntries(Object.entries(snap.p).filter(([k]) => live(k))));
    setLayoutMap({ ...initialLayoutMap, ...Object.fromEntries(Object.entries(snap.l).filter(([k]) => live(k)).map(([k, l]) => [k, sanitizeLayout(l)])) });
    setDraftOffer(null);
    if (stale) { setNotice('Restored a draft made against an older saved version. Review what differs, then Save.'); setReviewSignal(n => n + 1); }
  };
  const discardDraft = () => { storeDraft(null); setDraftOffer(null); };

  const diffs = useMemo(
    () => [
      ...diffLayout(initialLayout, layoutOf('global')),
      ...diffProps('Everything', initialGlobal, globalVals, k => PROP_BY_KEY[k]?.default),
      ...changedPacks.flatMap(id =>
        diffProps(`Pack: ${packs.find(x => x.id === id)?.name ?? id}`, initialPacks[id] ?? {}, packVals[id] ?? {}, () => '(follows global)'),
      ),
      ...changedScenes.flatMap(x => [
        ...diffLayout(sanitizeLayout(initialLayoutMap['scene:' + x.id]), layoutOf('scene:' + x.id)).map(d => ({
          ...d,
          scope: `Scene: ${x.name}`,
        })),
        ...diffProps(`Scene: ${x.name}`, initialPackMap['scene:' + x.id] ?? {}, packVals['scene:' + x.id] ?? {}, () => '(follows global)'),
      ]),
    ],
    [initialLayout, layoutOf, initialGlobal, globalVals, changedPacks, packs, initialPacks, packVals, changedScenes, initialLayoutMap, initialPackMap],
  );

  useEffect(() => {
    if (!dirty) setShowSaved(false);
  }, [dirty]);

  const shownLayout = showSaved ? initialActiveLayout : layout;
  const savedEffective: PropValues = isOver ? { ...initialGlobal, ...(initialPackMap[scope] ?? {}) } : initialGlobal;
  const versionDiffs = (v: VersionInfo): DiffLine[] => [
    ...diffLayout(v.layout, layout),
    ...diffProps('Everything', v.props, globalVals, k => PROP_BY_KEY[k]?.default),
    ...[...new Set([...Object.keys(v.packs), ...Object.keys(packVals)])].flatMap(id =>
      diffProps(`Pack: ${packs.find(x => x.id === id)?.name ?? id}`, v.packs[id] ?? {}, packVals[id] ?? {}, () => '(follows global)'),
    ),
  ];
  const versionDistance = (v: VersionInfo) => versionDiffs(v).length;

  // Save goes through the version check: a refused save keeps the editor as it is and shows the conflict banner.
  const guardedSave = async (fd: FormData) => {
    const r = await saveAction(fd);
    if (r) setConflict(r.conflict);
  };
  const overwrite = () => {
    const fd = new FormData();
    fd.set('payload', payload);
    fd.set('scope', scope);
    fd.set('note', note);
    fd.set('autoReload', autoReload ? 'on' : '');
    fd.set('expectedVersion', knownVersion);
    fd.set('force', 'on');
    setConflict(null);
    void saveAction(fd);
  };
  const loadTheirs = () => {
    if (!conflict) return;
    loadVersion(conflict);
    setKnownVersion(conflict.id);
    setConflict(null);
  };

  const loadVersion = (v: VersionInfo) => {
    setGlobalVals(v.props);
    setPackVals(m => ({ ...Object.fromEntries(Object.entries(m).filter(([k]) => k.startsWith('scene:'))), ...v.packs }));
    setLayoutMap(m => ({ ...m, global: v.layout }));
    setNotice(`Loaded the version from ${new Date(v.at).toLocaleString('en-GB', { timeZone: 'UTC' })}. Review, then Save.`);
  };

  const effectiveSparse: PropValues = useMemo(
    () => (isOver ? { ...globalVals, ...(packVals[scope] ?? {}) } : globalVals),
    [isOver, globalVals, packVals, scope],
  );
  const shownProps = showSaved ? savedEffective : effectiveSparse;

  const hiddenInScope = useCallback((d: PropDef) => isPack && d.group === 'collection', [isPack]);
  const defsFor = useCallback(
    (cat: string): PropDef[] =>
      PROPS.filter(d => {
        if (d.group !== cat || hiddenInScope(d)) return false;
        if (cat === 'variants') return d.variant === version;
        return true;
      }),
    [hiddenInScope, version],
  );
  const modifiedCount = useCallback(
    (cat: string) => PROPS.filter(d => d.group === cat && !hiddenInScope(d) && current[d.key] !== undefined).length,
    [hiddenInScope, current],
  );

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const matches = useCallback(
    (d: PropDef) => `${d.label} ${d.help ?? ''} ${d.section ?? ''} ${d.key}`.toLowerCase().includes(q),
    [q],
  );

  const groupSections = useCallback(
    (defs: PropDef[]) => {
      const m = new Map<string, PropDef[]>();
      defs.forEach(d => m.set(d.section ?? '', [...(m.get(d.section ?? '') ?? []), d]));
      return [...m.entries()].sort((a, b) => sectionRank(a[0]) - sectionRank(b[0]));
    },
    [],
  );

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
    if (d && d.readyState === 'complete' && d.location.href !== 'about:blank') {
      setReady(true);
      setLoadedCount(c => c + 1);
    }
  }, []);

  const previewVariant = version === 'regular' ? '' : version;
  const previewPackId = isPack ? scope : pickPack;
  const previewCards = packCards[previewPackId || packs[0]?.id || ''] ?? [];
  const previewCard = previewCards.some(c => c.number === pickCard) ? pickCard : 0;

  useEffect(() => {
    if (ready) post({ type: 'layout', layout: shownLayout });
  }, [ready, loadedCount, shownLayout, post]);

  useEffect(() => {
    if (ready) post({ type: 'variant', variant: previewVariant });
  }, [ready, loadedCount, previewVariant, post]);

  useEffect(() => {
    if (ready) post({ type: 'props', props: shownProps, packId: previewPackId, cardNumber: previewCard });
  }, [ready, loadedCount, shownProps, previewPackId, previewCard, post]);

  useEffect(() => {
    if (ready) post({ type: 'static', mode, showoff: showOff });
  }, [ready, loadedCount, mode, showOff, post]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const fitBase = box.w > 0 && box.h > 0 ? Math.min(box.w / shownLayout.width, box.h / shownLayout.height) : 0.3;
  const fit = fitBase * zoom;
  const frameW = shownLayout.width * fit,
    frameH = shownLayout.height * fit;

  const play = () => {
    if (!ready || playing) return;
    setPlaying(true);
    post(
      showOff && mode === 'pack'
        ? { type: 'showoff' }
        : { type: mode, moment: mode === 'pack' ? moment : undefined },
    );
    setTimeout(() => setPlaying(false), mode === 'pack' ? 13000 : 9000);
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(exportProps(effectiveSparse), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cheesy-overlay-${isPack ? packs.find(p => p.id === scope)?.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? 'pack' : 'global'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportProps(effectiveSparse), null, 2));
      setNotice('Copied to the clipboard.');
    } catch {
      setNotice('Could not copy. Use Download instead.');
    }
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

  const copyVariant = (from: VariantId) => {
    const next: PropValues = { ...current };
    for (const d of PROPS.filter(x => x.variant === version)) {
      const src = PROP_BY_KEY[d.key.replace(`variant.${version}.`, `variant.${from}.`)];
      if (!src) continue;
      const v = valueOf(src.key);
      if (!isOver && eq(v, d.default)) delete next[d.key];
      else next[d.key] = v;
    }
    replaceCurrent(next);
    setNotice(`Copied the ${VARIANT_LABELS[from]} look onto ${VARIANT_LABELS[version]}. Review, then Save.`);
  };

  const placement = layout[mode];
  const setPlacement = (patch: Partial<Placement> | ((p: Placement) => Partial<Placement>)) =>
    setLayoutVals(l => ({ ...l, [mode]: { ...l[mode], ...(typeof patch === 'function' ? patch(l[mode]) : patch) } }));
  const moved = (p: Placement) => p.scale !== 1 || p.offsetX !== 0 || p.offsetY !== 0;
  const layoutMoved =
    (moved(layout.pack) ? 1 : 0) +
    (moved(layout.collection) ? 1 : 0) +
    Object.keys(layout.pack.elements ?? {}).length +
    Object.keys(layout.collection.elements ?? {}).length +
    (layout.width !== DEFAULT_LAYOUT.width || layout.height !== DEFAULT_LAYOUT.height ? 1 : 0);
  const layoutCat = category === 'layout' && !isPack;
  // The selected thing can be moved when layout is editable (global or a scene), not in a pack override.
  const dragging = !!selected && !isPack;
  const viewOf = (t: string): Mode => (t === 'heading' || t === 'grid' ? 'collection' : 'pack');

  const moveView = (view: Mode, ox: number, oy: number) =>
    setLayoutVals(l => ({ ...l, [view]: { ...l[view], offsetX: ox, offsetY: oy } }));

  // One part of a view (the label, the bar...) moved on its own; back at its normal spot it is dropped from the layout.
  const elementAt = (view: Mode, id: string) => layout[view].elements?.[id as ElementId] ?? { scale: 1, offsetX: 0, offsetY: 0 };
  const setElement = (view: Mode, id: string, patch: Partial<Pick<Placement, 'scale' | 'offsetX' | 'offsetY'>>) =>
    setLayoutVals(l => {
      const elements = { ...l[view].elements };
      const next = { ...(elements[id as ElementId] ?? { scale: 1, offsetX: 0, offsetY: 0 }), ...patch };
      if (next.offsetX === 0 && next.offsetY === 0 && next.scale === 1) delete elements[id as ElementId];
      else elements[id as ElementId] = next;
      return { ...l, [view]: { ...l[view], elements } };
    });
  const moveElement = (view: Mode, id: string, ox: number, oy: number) => setElement(view, id, { offsetX: ox, offsetY: oy });

  // Corner-handle resize: `factor` is the pointer's distance from the centre against where the press began (aspect kept).
  const resizeTo = (target: string, wholeView: boolean, factor: number) => {
    if (isPack) return;
    if (!drag.current) {
      const view = wholeView ? mode : viewOf(target);
      const id = wholeView ? null : target;
      commit();
      drag.current = { view, id, ox: 0, oy: 0, s0: (id ? elementAt(view, id) : layout[view]).scale };
    }
    const { view, id, s0 = 1 } = drag.current;
    const scale = Math.round(Math.min(3, Math.max(0.25, s0 * factor)) * 100) / 100;
    if (id) setElement(view, id, { scale });
    else setLayoutVals(l => ({ ...l, [view]: { ...l[view], scale } }));
  };

  // Right-click menu on a layer (a preview part, a Layers row or a view heading); `id` null = the whole view.
  const sceneKeys = presets.map(x => 'scene:' + x.id).filter(k => k !== layoutKey);
  const resetLayer = (view: Mode, id: string | null) =>
    setLayoutVals(l => {
      if (!id) return { ...l, [view]: { ...l[view], scale: 1, offsetX: 0, offsetY: 0 } };
      const { [id as ElementId]: _gone, ...elements } = l[view].elements ?? {};
      return { ...l, [view]: { ...l[view], elements } };
    });
  // Only a whole view can be centred: a part's offset is relative to its normal spot, which is not the stage centre.
  const centerLayer = (view: Mode) => setLayoutVals(l => ({ ...l, [view]: { ...l[view], offsetX: 0, offsetY: 0 } }));
  const copyLayerToScenes = (view: Mode, id: string | null) => {
    const src = id ? layout[view].elements?.[id as ElementId] : { scale: layout[view].scale, offsetX: layout[view].offsetX, offsetY: layout[view].offsetY };
    setLayoutMap(m => {
      const out = { ...m };
      for (const k of sceneKeys) {
        const l = sanitizeLayout(m[k] ?? m.global);
        if (!id) out[k] = { ...l, [view]: { ...l[view], ...src } };
        else {
          const { [id as ElementId]: _gone, ...elements } = l[view].elements ?? {};
          out[k] = { ...l, [view]: { ...l[view], elements: src ? { ...elements, [id]: src } : elements } };
        }
      }
      return out;
    });
    setNotice(`Copied to ${sceneKeys.length} scene${sceneKeys.length === 1 ? '' : 's'}. Review, then Save.`);
  };

  // Shift+drag moves the whole view; a plain drag moves just the part that was grabbed.
  // `sx` / `sy`: the preview already snapped that axis to a guide, so the grid snap below skips it.
  const dragTo = (target: string, dx: number, dy: number, alt: boolean, shift: boolean, sx = false, sy = false) => {
    if (isPack) return;
    if (!drag.current) {
      const view = viewOf(target);
      commit();
      const id = shift ? null : target;
      const start = id ? elementAt(view, id) : layout[view];
      drag.current = { view, id, ox: start.offsetX, oy: start.offsetY };
    }
    const { view, id } = drag.current;
    // A part sits inside the view's scale, so the pointer's distance is divided by it to keep the part under the cursor.
    const k = id ? layout[view].scale || 1 : 1;
    let nx = Math.round(drag.current.ox + dx / k);
    let ny = Math.round(drag.current.oy + dy / k);
    if (snapOn && !alt) {
      const near = Math.max(2, Math.round(8 / fit));
      if (!sx) nx = Math.abs(nx) <= near ? 0 : Math.round(nx / 10) * 10;
      if (!sy) ny = Math.abs(ny) <= near ? 0 : Math.round(ny / 10) * 10;
    }
    if (id) moveElement(view, id, nx, ny);
    else moveView(view, nx, ny);
  };

  const dragEnd = () => {
    if (!drag.current) return;
    drag.current = null;
    commit();
  };

  // Arrow keys nudge the selected thing (Shift = 10 px); Esc clears the selection.
  const pressKey = (key: string, shift: boolean): boolean => {
    if (key === 'Escape') {
      setSelected('');
      return true;
    }
    const step = shift ? 10 : 1;
    const m = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[key];
    if (!m) return false;
    if (!dragging) return true;
    const view = viewOf(selected);
    const cur = elementAt(view, selected);
    moveElement(view, selected, cur.offsetX + m[0], cur.offsetY + m[1]);
    return true;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (pressKey(e.key, e.shiftKey)) e.preventDefault();
  };

  // Select one element and open its category and section; the preview click and the Layers panel share this.
  const selectTarget = (target: string) => {
    setSelected(target);
    const t = TARGET_SECTIONS[target];
    if (!t || (isPack && t[0] === 'collection')) return;
    const [c, section] = t;
    setCategory(c);
    setQuery('');
    setMode(c === 'collection' ? 'collection' : 'pack');
    setShowOff(c === 'showoff');
    if (c === 'variants') setVariantOpen(true);
    if (section) {
      const k = `${c}${c === 'variants' ? '.' + version : ''}/${section}`;
      // Drop earlier open/closed choices in this category so only the picked section starts open.
      const prefix = k.slice(0, k.indexOf('/') + 1);
      setOpenMap(m => ({ ...Object.fromEntries(Object.entries(m).filter(([key]) => !key.startsWith(prefix))), [k]: true }));
      setFocusKey(k);
    }
  };
  // Select a whole view: nothing picked, the Layout category showing that view.
  const selectView = (view: Mode) => {
    setSelected('');
    setCategory('layout');
    setQuery('');
    setMode(view);
    setShowOff(false);
  };
  const hoverElement = (target: string) => post({ type: 'hover', target });

  // Moving things is off in a pack override, so the menu is too.
  const openLayerMenu = (view: Mode, id: string | null, x: number, y: number) => { if (!isPack) setLayerMenu({ view, id, x, y }); };
  const closeLayerMenu = () => setLayerMenu(null);
  // A right-click inside the preview: x / y are in the frame's own pixels, so scale them by the fit to get screen position.
  const contextAt = (target: string, x: number, y: number) => {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r) return;
    selectTarget(target);
    openLayerMenu(viewOf(target), target, r.left + x * fit, r.top + y * fit);
  };

  const live = useRef({ dragTo, resizeTo, dragEnd, pressKey, selectTarget, contextAt });
  live.current = { dragTo, resizeTo, dragEnd, pressKey, selectTarget, contextAt };

  // Tell the preview what is selected (a part, or a whole view in the Layout panel), whether it may be edited, and the snap switch.
  const viewSelected = !selected && category === 'layout';
  useEffect(() => {
    if (ready) post({ type: 'selected', target: selected, view: viewSelected && !isPack, canEdit: dragging || (viewSelected && !isPack), snap: snapOn });
  }, [ready, loadedCount, selected, viewSelected, dragging, isPack, snapOn, post]);

  const catId = isPack && category === 'collection' ? 'pack' : category;

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const data = e.data as { type?: string; target?: string; dx?: number; dy?: number; alt?: boolean; shift?: boolean; key?: string; sx?: boolean; sy?: boolean; view?: boolean; factor?: number; x?: number; y?: number } | null;
      if (data?.type === 'drag' && data.target && Number.isFinite(data.dx) && Number.isFinite(data.dy)) {
        live.current.dragTo(data.target, data.dx as number, data.dy as number, !!data.alt, !!data.shift, !!data.sx, !!data.sy);
        return;
      }
      if (data?.type === 'resize' && typeof data.factor === 'number' && Number.isFinite(data.factor) && data.factor > 0) {
        live.current.resizeTo(data.target ?? '', !!data.view, data.factor);
        return;
      }
      if (data?.type === 'context' && data.target && Number.isFinite(data.x) && Number.isFinite(data.y)) {
        live.current.contextAt(data.target, data.x as number, data.y as number);
        return;
      }
      if (data?.type === 'dragend') return live.current.dragEnd();
      if (data?.type === 'key' && typeof data.key === 'string') {
        live.current.pressKey(data.key, !!data.shift);
        return;
      }
      if (data?.type !== 'select' || !data.target) return;
      live.current.selectTarget(data.target);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    if (!focusKey) return;
    document.querySelector(`[data-section="${CSS.escape(focusKey)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setFocusKey('');
  }, [focusKey]);

  const value: OverlayEditorContextValue = {
    siteUrl,
    overlayKey,
    packs,
    presets,
    seasons,
    packCards,
    initialLayout,
    saveAction: guardedSave,
    knownVersion,
    conflict,
    versionDiffs,
    overwrite,
    loadTheirs,
    savePresetAction,
    deletePresetAction,
    scope,
    setScope,
    isPack,
    isScene,
    isOver,
    scene,
    dirty,
    payload,
    revert,
    draftOffer: draftOffer && { at: draftOffer.at, stale: draftOffer.stale },
    restoreDraft,
    discardDraft,
    reviewSignal,
    openReview: () => setReviewSignal(n => n + 1),
    lastSavedAt: versions[0]?.at ?? null,
    hintSignal,
    showHint: () => setHintSignal(n => n + 1),
    notice,
    setNotice,
    refreshing,
    startRefresh,
    changedLayout,
    changedGlobal,
    changedPacks,
    changedScenes,
    diffs,
    layout,
    layoutVals,
    setLayoutVals,
    setPlacement,
    layoutMoved,
    placement,
    layoutCat,
    dragging,
    selected,
    selectTarget,
    selectView,
    hoverElement,
    layerMenu,
    openLayerMenu,
    closeLayerMenu,
    resetLayer,
    centerLayer,
    copyLayerToScenes,
    sceneCount: sceneKeys.length,
    layoutOf,
    category,
    setCategory,
    catId,
    version,
    setVersion,
    variantOpen,
    setVariantOpen,
    mode,
    setMode,
    moment,
    setMoment,
    showOff,
    setShowOff,
    query,
    setQuery,
    searching,
    openMap,
    setOpenMap,
    setSelected,
    boxRef,
    frameRef,
    fit,
    frameW,
    frameH,
    shownLayout,
    ready,
    setReady,
    setLoadedCount,
    playing,
    play,
    showGrid,
    setShowGrid,
    showThirds,
    setShowThirds,
    showSafe,
    setShowSafe,
    snapOn,
    setSnapOn,
    zoom,
    setZoom,
    bg,
    setBg,
    bgImage,
    setBgImage,
    showSaved,
    setShowSaved,
    pickPack,
    setPickPack,
    pickCard,
    setPickCard,
    previewCards,
    previewCard,
    onKeyDown,
    undo,
    redo,
    canUndo,
    canRedo,
    presetName,
    setPresetName,
    importText,
    setImportText,
    importError,
    setImportError,
    download,
    copyJson,
    runImport,
    applyPreset,
    versionList,
    setVersionList,
    versionDistance,
    loadVersion,
    looks,
    setLooks,
    note,
    setNote,
    autoReload,
    setAutoReload,
    copyTargets,
    setCopyTargets,
    copyFrom,
    setCopyFrom,
    replaceCurrent,
    copyVariant,
    packVals,
    setPackVals,
    globalVals,
    current,
    valueOf,
    setValue,
    resetKeys,
    effectiveSparse,
    modifiedCount,
    defsFor,
    groupSections,
    matches,
    hiddenInScope,
  };

  return <OverlayEditorContext.Provider value={value}>{children}</OverlayEditorContext.Provider>;
}

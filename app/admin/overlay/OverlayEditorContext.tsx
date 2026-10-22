'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
  mergePropValues,
  type PropDef,
  type PropValue,
  type PropValues,
  type VariantId,
} from '@/lib/overlay-props';
import { DEFAULT_LAYOUT, ELEMENT_IDS, MAX_ZONES, boxesOverlap, sanitizeLayout, alignOffsets, distributeOffsets, anchorOffset, type AlignMode, type DesignBox, type ElementId, type ElementPlacement, type OverlayLayout, type OverlayZone, type Placement } from '@/lib/overlay-layout';
import { saveOverlayZonesAction } from '@/app/admin/overlay-actions';
import { MAX_CUSTOM, duplicateCustom, newCustom, pasteCustom, stepCustom, type CustomKind, type CustomLayer, type CustomText } from '@/lib/overlay-custom';
import { diffLayout, diffProps, type DiffLine } from '@/lib/overlay-diff';
import { mergeTextPatch, type TextPatch } from '@/lib/overlay-text-style';
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
import { LAYER_NAMES } from './LayersPanel';
import type { ScheduledLook } from '@/lib/overlay-settings';

const canon = (v: PropValues) => JSON.stringify(Object.keys(v).sort().map(k => [k, v[k]]));
const eq = (a: PropValue | undefined, b: PropValue | undefined) => JSON.stringify(a) === JSON.stringify(b);
export type Tool = 'move' | 'hand' | 'zoom' | 'text' | 'shape' | 'image';
export type TextTemplate = Partial<Pick<CustomText, 'font' | 'size' | 'color' | 'valign' | 'style'>>;
/** The user's own guide lines, in design px (an editor aid: kept in localStorage per scope, never saved to the overlay). */
export type Guides = { x: number[]; y: number[] };
const RULERS_KEY = 'tcg:overlay-rulers';
const GUIDES_KEY = 'tcg:overlay-guides:';
const LOCKS_KEY = 'tcg:overlay-locks:';
const DRAFT_KEY = 'overlay-editor-draft';
const VIEW_NAMES: Record<Mode, string> = { pack: 'pack opening', collection: 'collection view' };
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
  banner: ['moments'],
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

export interface TimelineState { paused: boolean; t: number; dur: number; markers: Record<string, number> | null }
/** The right-click menu on a layer: `id` null = the whole view; x / y are screen pixels. */
export interface LayerMenuState { view: Mode; id: string | null; x: number; y: number }

export interface OverlayEditorProps {
  siteUrl: string;
  overlayKey: string;
  versions: VersionInfo[];
  seasons: SeasonInfo[];
  seasonLooks: Record<string, string>;
  scheduledLooks: ScheduledLook[];
  packCards: Record<string, CardInfo[]>;
  initialAutoReload: boolean;
  initialZones: Record<string, OverlayZone[]>;
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
  setLayoutVals: (u: OverlayLayout | ((l: OverlayLayout) => OverlayLayout), label?: string) => void;
  setPlacement: (patch: Partial<Placement> | ((p: Placement) => Partial<Placement>)) => void;
  layoutMoved: number;
  placement: Placement;
  layoutCat: boolean;
  dragging: boolean;
  selected: string;
  /** Every selected part (same view); `selected` is the last one added. */
  selection: string[];
  /** Parts locked against canvas edits (an editor aid, kept in localStorage per scope). */
  locked: string[];
  toggleSelect: (target: string) => void;
  toggleLock: (ids: string[]) => void;
  /** Line the unlocked selected parts up (one part: to the stage; several: to their bounding box), or space them evenly (3 or more). */
  alignSelection: (mode: AlignMode) => void;
  distributeSelection: (axis: 'x' | 'y') => void;
  resetSelection: () => void;
  /** Link the selected built-in parts of a view so they select, move and scale together; Unlink releases their sets (global or scene layouts only). */
  linkSelection: () => void;
  unlinkSelection: () => void;
  selectTarget: (target: string) => void;
  selectView: (view: Mode) => void;
  hoverElement: (target: string) => void;
  layerMenu: LayerMenuState | null;
  openLayerMenu: (view: Mode, id: string | null, x: number, y: number) => void;
  closeLayerMenu: () => void;
  resetLayer: (view: Mode, id: string | null) => void;
  editLayer: (view: Mode, id: string, patch: Partial<ElementPlacement>) => void;
  anchor: { x: number; y: number };
  setAnchor: (a: { x: number; y: number }) => void;
  centerLayer: (view: Mode) => void;
  copyLayerToScenes: (view: Mode, id: string | null) => void;
  sceneCount: number;
  /** Custom layers (38.7 f): duplicate the selected one, copy the selected ones, paste into the current view. */
  duplicateSelected: () => void;
  copySelected: () => void;
  pasteClip: () => void;
  hasClip: boolean;
  layoutOf: (k: string) => OverlayLayout;

  // Navigation & Category
  category: string;
  setCategory: (c: string) => void;
  openCat: string | null;
  setOpenCat: (c: string | null) => void;
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
  /** A stream rehearsal (5 dry pulls and a show-off, back to back) is running. */
  rehearsing: boolean;
  rehearse: () => void;
  stopRehearsal: () => void;
  /** The preview's reveal clock while a pull plays (null when none is): seconds, phase markers, paused or running. */
  timeline: TimelineState | null;
  /** The last play's real frame rate in this browser (average and worst 250 ms stretch); null before any play. */
  fps: { avg: number; worst: number } | null;
  /** Preview elements whose wording does not fit the stage (by `data-edit` tag), with the factor that would fit. */
  wordFit: Record<string, number>;
  fitStage: string;
  /** Pause, resume or seek (seconds) the playing reveal. */
  timelineCmd: (action: 'pause' | 'resume' | 'seek', t?: number) => void;
  /** Shows one setting's value in the preview without changing it (no undo step); null restores. Used by the font picker's hover. */
  previewProp: (key: string, value: string | null) => void;
  play: () => void;
  showGrid: boolean;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  showRulers: boolean;
  toggleRulers: () => void;
  guides: Guides;
  setGuides: React.Dispatch<React.SetStateAction<Guides>>;
  guidesLocked: boolean;
  setGuidesLocked: React.Dispatch<React.SetStateAction<boolean>>;
  zones: OverlayZone[];
  setZones: (fn: (z: OverlayZone[]) => OverlayZone[]) => void;
  overlapIds: string[];
  showThirds: boolean;
  setShowThirds: React.Dispatch<React.SetStateAction<boolean>>;
  showSafe: boolean;
  setShowSafe: React.Dispatch<React.SetStateAction<boolean>>;
  snapOn: boolean;
  setSnapOn: React.Dispatch<React.SetStateAction<boolean>>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  activeTool: Tool;
  setTool: (t: Tool) => void;
  /** Text tool: add a text layer to the current view at this box and select it. */
  addCustomAt: (kind: CustomKind, box: { x: number; y: number; w?: number; h?: number }) => void;
  /** The custom layer whose wording field should take focus (set by a double-click on it in the preview). */
  focusText: string;
  /** The Text tool's defaults for the next text layer placed (ROADMAP 38.31): editor state only, never stored. */
  textTemplate: TextTemplate;
  setTextTemplate: (t: TextTemplate) => void;
  setFocusText: (id: string) => void;
  zoomStep: (dir: 1 | -1, cx?: number, cy?: number) => void;
  zoomFit: () => void;
  zoomActual: () => void;
  zoomTo: (z: number) => void;
  fitBase: number;
  focusMode: boolean;
  setFocusMode: React.Dispatch<React.SetStateAction<boolean>>;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  saveSignal: number;
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
  historyLabels: string[];
  historyIndex: number;
  jumpTo: (i: number) => void;
  tagEdit: (label: string) => void;
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
  scheduledLooks: ScheduledLook[];
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
  scheduledLooks,
  packCards,
  initialAutoReload,
  initialZones,
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
  // The History label for the step the next commit takes; the first edit of a coalesced step names it.
  const pendingLabel = useRef<string | null>(null);
  const tagEdit = useCallback((l: string) => { pendingLabel.current ??= l; }, []);
  const setLayoutVals = useCallback(
    (u: OverlayLayout | ((l: OverlayLayout) => OverlayLayout), label = 'Layout') => {
      tagEdit(label);
      setLayoutMap(m => ({ ...m, [layoutKey]: typeof u === 'function' ? u(m[layoutKey] ?? m.global) : u }));
    },
    [layoutKey, tagEdit],
  );
  const layout = useMemo(() => sanitizeLayout(layoutVals), [layoutVals]);
  const initialActiveLayout = initialLayoutMap[layoutKey] ?? initialLayout;

  // The category opened on the Document page (null = the Document page itself); a deep link (?group=) starts it open.
  const [openCat, setOpenCat] = useState<string | null>(
    initialCategory && PROP_GROUPS.some(g => g.id === initialCategory) ? initialCategory : null,
  );
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
  const [rehearsing, setRehearsing] = useState(false);
  const rehearsalRun = useRef<{ stop: boolean } | null>(null);
  /** Called with every timeline report (or 'stop') while a rehearsal waits for the current pull to end. */
  const pullWait = useRef<((m: { active: boolean; cooldown: number } | 'stop') => void) | null>(null);
  const [timeline, setTimeline] = useState<TimelineState | null>(null);
  const [fps, setFps] = useState<{ avg: number; worst: number } | null>(null);
  const [fitReport, setFitReport] = useState<{ over: Record<string, number>; stage: string }>({ over: {}, stage: '1280x720' });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [presetName, setPresetName] = useState('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [notice, setNotice] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // A drag or a corner-handle resize in progress (one undo step): `s0` is the scale a resize started from.
  // `id` / `ox` / `oy` / `s0` are the primary part's start; `group` holds every moved part's start (one entry unless several are selected).
  const drag = useRef<{ view: Mode; id: string | null; ox: number; oy: number; s0?: number; box?: { x: number; y: number; w: number; h: number }; group?: { id: string; ox: number; oy: number; s0: number }[] } | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  // The resize anchor (ROADMAP 38.22, editor state only): scaling a part keeps this point of its box still. `sizes` holds each part's box at size 100%, measured for it.
  const [anchor, setAnchor] = useState({ x: 0.5, y: 0.5 });
  const sizes = useRef<Record<string, { w: number; h: number }>>({});
  const selected = selection[selection.length - 1] ?? '';
  const setSelected = useCallback((t: string) => setSelection(t ? [t] : []), []);
  const [locked, setLocked] = useState<string[]>([]);
  const locksFor = useRef('');
  useEffect(() => {
    let l: string[] = [];
    try {
      const d = JSON.parse(localStorage.getItem(LOCKS_KEY + layoutKey) ?? 'null');
      if (Array.isArray(d)) l = d.filter((x): x is string => typeof x === 'string');
    } catch { /* storage blocked or corrupt */ }
    locksFor.current = layoutKey;
    setLocked(l);
  }, [layoutKey]);
  useEffect(() => {
    if (locksFor.current !== layoutKey) return;
    try { localStorage.setItem(LOCKS_KEY + layoutKey, JSON.stringify(locked)); } catch { /* storage blocked */ }
  }, [locked]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleLock = (ids: string[]) => setLocked(l => (ids.every(i => l.includes(i)) ? l.filter(i => !ids.includes(i)) : [...new Set([...l, ...ids])]));
  const [layerMenu, setLayerMenu] = useState<LayerMenuState | null>(null);
  const [clip, setClip] = useState<CustomLayer[]>([]);

  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>('move');
  const [focusText, setFocusText] = useState('');
  const [textTemplate, setTextTemplate] = useState<TextTemplate>({});
  const [spaceDown, setSpaceDown] = useState(false); // Space held: a temporary Hand
  const [focusMode, setFocusMode] = useState(false); // Tab: only the canvas shows
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [saveSignal, setSaveSignal] = useState(0); // Ctrl+S: the top bar owns the save form and submits it when this changes
  const zoomAnchor = useRef<{ dx: number; dy: number; x: number; y: number } | null>(null);
  const [showThirds, setShowThirds] = useState(false);
  const [showRulers, setShowRulers] = useState(false);
  useEffect(() => { try { setShowRulers(localStorage.getItem(RULERS_KEY) === '1'); } catch { /* storage blocked */ } }, []);
  const toggleRulers = () => setShowRulers(v => {
    try { localStorage.setItem(RULERS_KEY, v ? '0' : '1'); } catch { /* storage blocked */ }
    return !v;
  });
  // Guides follow the layout scope (a pack uses the global ones); `guidesFor` is the key they were loaded for, so a scope switch never saves the old ones under the new key.
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  const [guidesLocked, setGuidesLocked] = useState(false);
  const guidesFor = useRef('');
  useEffect(() => {
    let g: Guides = { x: [], y: [] };
    try {
      const d = JSON.parse(localStorage.getItem(GUIDES_KEY + layoutKey) ?? 'null');
      const nums = (a: unknown) => (Array.isArray(a) ? a.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : []);
      if (d) g = { x: nums(d.x), y: nums(d.y) };
    } catch { /* storage blocked or corrupt */ }
    guidesFor.current = layoutKey;
    setGuides(g);
  }, [layoutKey]);
  useEffect(() => {
    if (guidesFor.current !== layoutKey) return;
    try { localStorage.setItem(GUIDES_KEY + layoutKey, JSON.stringify(guides)); } catch { /* storage blocked */ }
  }, [guides]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Twitch UI zones (38.25): editor-only boxes, saved staff-wide per scope as they are edited (not part of Save / versions). Pack scope has none.
  const [zonesMap, setZonesMap] = useState(initialZones);
  const zones = useMemo(() => (isPack ? [] : zonesMap[layoutKey] ?? []), [isPack, zonesMap, layoutKey]);
  const zoneSave = useRef<Record<string, ReturnType<typeof setTimeout>>>({}); // one timer per scope, so switching scope never drops a pending save
  const setZones = (fn: (z: OverlayZone[]) => OverlayZone[]) => {
    const next = fn(zones).slice(0, MAX_ZONES), key = layoutKey;
    setZonesMap(m => ({ ...m, [key]: next }));
    clearTimeout(zoneSave.current[key]);
    zoneSave.current[key] = setTimeout(() => void saveOverlayZonesAction(key, next), 600);
  };
  const [overlapIds, setOverlapIds] = useState<string[]>([]);
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
      // A text style is what the layer ends up with: the global patch with the pack's own fields on top.
      if (def.type === 'textStyle' && isOver) return mergeTextPatch(globalVals[key] as TextPatch | undefined, current[key] as TextPatch | undefined);
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
    tagEdit(def.label + (def.variant ? ` (${VARIANT_LABELS[def.variant]})` : ''));
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
        if (eq(v, inherited) || (def.type === 'textStyle' && !Object.keys(v as object).length)) delete own[key];
        else own[key] = v;
        return { ...p, [scope]: own };
      });
    }
  };

  const resetKeys = (keys: string[]) => {
    tagEdit(keys.length === 1 && PROP_BY_KEY[keys[0]] ? `Reset ${PROP_BY_KEY[keys[0]].label}` : `Reset ${keys.length} settings`);
    const drop = (m: PropValues) => {
      const n = { ...m };
      keys.forEach(k => delete n[k]);
      return n;
    };
    if (!isOver) setGlobalVals(drop);
    else setPackVals(p => ({ ...p, [scope]: drop(p[scope] ?? {}) }));
  };

  const replaceCurrent = (next: PropValues) => {
    tagEdit('Replace settings');
    if (!isOver) setGlobalVals(next);
    else setPackVals(p => ({ ...p, [scope]: next }));
  };

  // Undo / redo
  const stateRef = useRef<Snap>({ g: globalVals, p: packVals, l: layoutMap });
  stateRef.current = { g: globalVals, p: packVals, l: layoutMap };
  const hist = useRef<{ list: Snap[]; labels: string[]; i: number; timer: ReturnType<typeof setTimeout> | null; skip: boolean }>({
    list: [{ g: initialGlobal, p: initialPackMap, l: initialLayoutMap }],
    labels: ['Opened'],
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
    if (snapKey(cur) === snapKey(h.list[h.i])) {
      pendingLabel.current = null;
      return;
    }
    h.list = [...h.list.slice(0, h.i + 1), cur].slice(-60);
    h.labels = [...h.labels.slice(0, h.i + 1), pendingLabel.current ?? 'Edit'].slice(-60);
    pendingLabel.current = null;
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

  // Jump to any step of the History panel: the same restore as undo / redo with a chosen index.
  const jumpTo = (i: number) => {
    commit();
    const h = hist.current;
    if (i < 0 || i >= h.list.length || i === h.i) return;
    h.i = i;
    restoreSnap(h.list[i]);
  };

  const canUndo = hist.current.i > 0 || snapKey(stateRef.current) !== snapKey(hist.current.list[hist.current.i]);
  const canRedo = hist.current.i < hist.current.list.length - 1;

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
    tagEdit('Revert all changes');
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
    tagEdit('Restore draft');
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
  const savedEffective: PropValues = isOver ? mergePropValues(initialGlobal, initialPackMap[scope]) : initialGlobal;
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
    tagEdit(`Load version '${v.note || new Date(v.at).toLocaleString('en-GB', { timeZone: 'UTC' })}'`);
    setGlobalVals(v.props);
    setPackVals(m => ({ ...Object.fromEntries(Object.entries(m).filter(([k]) => k.startsWith('scene:'))), ...v.packs }));
    setLayoutMap(m => ({ ...m, global: v.layout }));
    setNotice(`Loaded the version from ${new Date(v.at).toLocaleString('en-GB', { timeZone: 'UTC' })}. Review, then Save.`);
  };

  const effectiveSparse: PropValues = useMemo(
    () => (isOver ? mergePropValues(globalVals, packVals[scope]) : globalVals),
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
  const activeTool: Tool = spaceDown ? 'hand' : tool;

  // Zoom is a multiple of "Fit" (1 = fit); the real scale is `fit`, clamped to 10% to 800%. The point under (cx, cy) stays put.
  const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
  const zoomTo = (z: number, cx?: number, cy?: number) => {
    const box = boxRef.current;
    const stage = box?.firstElementChild;
    if (!box || !stage || fitBase <= 0) return;
    const nz = Math.min(8 / fitBase, Math.max(Math.min(0.1 / fitBase, 1), z));
    if (nz === zoom) return;
    const br = box.getBoundingClientRect(),
      sr = stage.getBoundingClientRect();
    const x = cx ?? br.left + br.width / 2,
      y = cy ?? br.top + br.height / 2;
    const scale = sr.width / shownLayout.width || fit;
    zoomAnchor.current = { dx: (x - sr.left) / scale, dy: (y - sr.top) / scale, x, y };
    setZoom(nz);
  };
  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    zoomAnchor.current = null;
    const box = boxRef.current,
      stage = box?.firstElementChild;
    if (!a || !box || !stage) return;
    const r = stage.getBoundingClientRect();
    box.scrollLeft += r.left + a.dx * fit - a.x;
    box.scrollTop += r.top + a.dy * fit - a.y;
  }, [fit]);
  const zoomStep = (dir: 1 | -1, cx?: number, cy?: number) => {
    const next = dir > 0 ? ZOOM_STEPS.find(s => s > zoom * 1.001) : [...ZOOM_STEPS].reverse().find(s => s < zoom / 1.001);
    if (next) zoomTo(next, cx, cy);
  };
  const zoomFit = () => zoomTo(1);
  const zoomActual = () => zoomTo(1 / fitBase);
  // Wheel over the canvas: Ctrl zooms at the pointer; past fit it pans (Shift = sideways). True when it was used.
  const wheel = (dx: number, dy: number, ctrl: boolean, shift: boolean, cx: number, cy: number): boolean => {
    if (ctrl) {
      zoomTo(zoom * Math.exp(-dy * 0.002), cx, cy);
      return true;
    }
    if (zoom <= 1.001) return false;
    boxRef.current?.scrollBy(dx || (shift ? dy : 0), shift ? 0 : dy);
    return true;
  };

  const previewProp = (key: string, value: string | null) => {
    if (ready) post({ type: 'props', props: value === null ? shownProps : { ...shownProps, [key]: value }, packId: previewPackId, cardNumber: previewCard });
  };
  const timelineCmd = (action: 'pause' | 'resume' | 'seek', t?: number) => {
    post({ type: 'timeline', action, t });
    if (action === 'pause') setTimeline(s => s && { ...s, paused: true });
    else if (action === 'resume') setTimeline(s => s && { ...s, paused: false });
    else setTimeline(s => s && { ...s, t: t ?? s.t });
  };
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

  // The rehearsal is driven from here: start a pull, wait for the widget to report it ended, wait the pack's cooldown, repeat.
  const stopRehearsal = () => {
    if (!rehearsalRun.current) return;
    rehearsalRun.current.stop = true;
    rehearsalRun.current = null;
    pullWait.current?.('stop');
    post({ type: 'stop' });
    setTimeline(null);
    setPlaying(false);
    setRehearsing(false);
  };
  const rehearse = async () => {
    if (!ready || playing || rehearsalRun.current || mode !== 'pack') return;
    const run = { stop: false };
    rehearsalRun.current = run;
    setRehearsing(true);
    // Resolves with the pack's cooldown (seconds) once the pull that just started has ended.
    const pullEnded = () => new Promise<number>(resolve => {
      let started = false;
      const done = (c: number) => { clearTimeout(guard); pullWait.current = null; resolve(c); };
      const guard = setTimeout(() => done(1), 40000);
      pullWait.current = m => {
        if (m === 'stop') done(0);
        else if (m.active) started = true;
        else if (started) done(m.cooldown);
      };
    });
    const ids = packs.map(p => p.id);
    const variants = ['regular', 'reverse', 'full', 'shiny', 'regular'];
    for (let i = 0; i < 5 && !run.stop; i++) {
      const ended = pullEnded();
      post({ type: 'pack', packId: ids.length ? ids[i % ids.length] : '', variant: variants[i], moment: i === 2 ? 'newCard' : undefined });
      const cooldown = await ended;
      if (run.stop) return;
      await new Promise(r => setTimeout(r, cooldown * 1000));
    }
    if (run.stop) return;
    const ended = pullEnded();
    post({ type: 'showoff' });
    await ended;
    if (run.stop) return;
    rehearsalRun.current = null;
    setRehearsing(false);
  };
  useEffect(() => () => { if (rehearsalRun.current) rehearsalRun.current.stop = true; }, []);
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
      tagEdit('Import settings');
      replaceCurrent(values);
      setImportError('');
      setImportText('');
      setNotice(`Imported ${Object.keys(values).length} setting${Object.keys(values).length === 1 ? '' : 's'}. Review, then Save.`);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not import that.');
    }
  };

  const applyPreset = (p: PresetInfo) => {
    tagEdit(`Apply look '${p.name}'`);
    replaceCurrent(isPack ? mergePropValues(packVals[scope], p.props) : { ...p.props });
    setNotice(`Applied "${p.name}". Review, then Save.`);
  };

  const copyVariant = (from: VariantId) => {
    tagEdit(`Copy ${VARIANT_LABELS[from]} look onto ${VARIANT_LABELS[version]}`);
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
    setLayoutVals(l => ({ ...l, [mode]: { ...l[mode], ...(typeof patch === 'function' ? patch(l[mode]) : patch) } }), `Move ${VIEW_NAMES[mode]}`);
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
    setLayoutVals(l => ({ ...l, [view]: { ...l[view], offsetX: ox, offsetY: oy } }), `Move ${VIEW_NAMES[view]}`);

  // One part of a view (the label, the bar...) moved on its own; back at its normal spot it is dropped from the layout.
  const elementAt = (view: Mode, id: string) => layout[view].elements?.[id as ElementId] ?? { scale: 1, offsetX: 0, offsetY: 0 };
  // Several parts in one layout update (so one History step), each patched the way a single one is.
  const setElements = (view: Mode, patches: Record<string, Partial<ElementPlacement>>) =>
    setLayoutVals(l => {
      const elements = { ...l[view].elements };
      for (const [id, patch] of Object.entries(patches)) {
        const next = { ...(elements[id as ElementId] ?? { scale: 1, offsetX: 0, offsetY: 0 }), ...patch };
        if (next.opacity === undefined || next.opacity >= 1) delete next.opacity;
        if (next.offsetX === 0 && next.offsetY === 0 && next.scale === 1 && next.opacity === undefined) delete elements[id as ElementId];
        else elements[id as ElementId] = next;
      }
      return { ...l, [view]: { ...l[view], elements } };
    });
  const setElement = (view: Mode, id: string, patch: Partial<ElementPlacement>) => setElements(view, { [id]: patch });
  // The parts an edit on `target` acts on: the whole selection when it is part of it, else just that part; locked parts are skipped.
  const linkSet = (target: string) => layout[viewOf(target)].links?.find(s => s.includes(target)) ?? [target];
  const editable = (target: string) => (selection.includes(target) ? selection : [target]).filter(id => !locked.includes(id));
  const layersLabel = (verb: string, ids: string[]) => (ids.length > 1 ? `${verb} ${ids.length} layers` : `${verb} ${LAYER_NAMES[ids[0] as ElementId] ?? ids[0]}`);
  // The Layer block's fields: the same clamps as dragging, resizing and sanitizeLayout, one labelled History step per edit.
  const editLayer = (view: Mode, id: string, patch: Partial<ElementPlacement>) => {
    const name = LAYER_NAMES[id as ElementId];
    const next: Partial<ElementPlacement> = {};
    if (patch.offsetX !== undefined) next.offsetX = Math.round(Math.min(layout.width, Math.max(-layout.width, patch.offsetX)));
    if (patch.offsetY !== undefined) next.offsetY = Math.round(Math.min(layout.height, Math.max(-layout.height, patch.offsetY)));
    if (patch.scale !== undefined) next.scale = Math.round(Math.min(3, Math.max(0.25, patch.scale)) * 100) / 100;
    if (patch.opacity !== undefined) next.opacity = Math.round(Math.min(1, Math.max(0, patch.opacity)) * 100) / 100;
    const at = elementAt(view, id), size = sizes.current[id];
    if (next.scale !== undefined && size) {
      const vs = layout[view].scale, d = anchorOffset({ x: 0, y: 0, w: size.w * at.scale * vs, h: size.h * at.scale * vs }, anchor, at.scale, next.scale, vs);
      next.offsetX = Math.round(at.offsetX + d.dx);
      next.offsetY = Math.round(at.offsetY + d.dy);
    }
    tagEdit(next.scale !== undefined ? `Resize ${name}` : next.opacity !== undefined ? `Fade ${name}` : `Move ${name}`);
    setElement(view, id, next);
  };

  // The admin's own layers (ROADMAP 38.7): found by their `custom:<id>` target, moved and resized by box (design px) rather than by offset and scale.
  const customOf = (target: string) => {
    for (const view of ['pack', 'collection'] as const) {
      const l = layout[view].custom?.find(c => `custom:${c.id}` === target);
      if (l) return { view, l };
    }
    return null;
  };
  const patchCustom = (view: Mode, id: string, patch: Partial<CustomLayer>) =>
    setLayoutVals(l => ({ ...l, [view]: { ...l[view], custom: (l[view].custom ?? []).map(c => (c.id === id ? ({ ...c, ...patch } as CustomLayer) : c)) } }));
  const beginCustom = (target: string, verb: string) => {
    const c = customOf(target);
    if (!c) return null;
    if (!drag.current) {
      commit();
      tagEdit(`${verb} ${c.l.name}`);
      drag.current = { view: c.view, id: target, ox: 0, oy: 0, box: { x: c.l.x, y: c.l.y, w: c.l.w, h: c.l.h } };
    }
    return { id: c.l.id, view: drag.current.view, box: drag.current.box! };
  };
  const addCustomAt = (kind: CustomKind, box: { x: number; y: number; w?: number; h?: number }) => {
    if (isPack) return;
    const view = mode;
    const have = layout[view].custom ?? [];
    if (have.length >= MAX_CUSTOM) return;
    const made = newCustom(kind, have.map(c => c.id), layout.width, layout.height, box);
    const layer = made.kind === 'text' ? { ...made, ...textTemplate } : made;
    setLayoutVals(l => ({ ...l, [view]: { ...l[view], custom: [...(l[view].custom ?? []), layer] } }), `Add ${kind} layer`);
    selectTarget(`custom:${layer.id}`);
    setTool('move');
    if (kind === 'text') setFocusText(layer.id);
  };

  const duplicateSelected = () => {
    const c = isPack ? null : customOf(selected);
    if (!c) return;
    const r = duplicateCustom(layout[c.view].custom ?? [], c.l.id);
    if (!r) { setNotice(`A view holds at most ${MAX_CUSTOM} layers. Delete one first.`); return; }
    setLayoutVals(l => ({ ...l, [c.view]: { ...l[c.view], custom: r.list } }), `Duplicate ${c.l.name}`);
    selectTarget(`custom:${r.added.id}`);
  };
  const copySelected = () => {
    const first = isPack ? null : customOf(selected);
    if (!first) return;
    const ids = new Set((selection.length > 1 ? selection : [selected]).filter(t => t.startsWith('custom:')));
    const layers = (layout[first.view].custom ?? []).filter(l => ids.has(`custom:${l.id}`));
    setClip(layers);
    setNotice(`Copied ${layers.length === 1 ? layers[0].name : `${layers.length} layers`}. Paste with Ctrl+V in any view or scene.`);
  };
  const pasteClip = () => {
    if (isPack || !clip.length) return;
    const view = mode;
    const r = pasteCustom(layout[view].custom ?? [], clip);
    if (!r) { setNotice(`A view holds at most ${MAX_CUSTOM} layers. Delete some first.`); return; }
    setLayoutVals(l => ({ ...l, [view]: { ...l[view], custom: r.list } }), `Paste ${r.added.length === 1 ? r.added[0].name : `${r.added.length} layers`}`);
    selectTarget(`custom:${r.added[r.added.length - 1].id}`);
  };

  // Side-handle resize: the dragged edge follows the pointer (dx / dy are the pointer's travel in design px), the opposite edge stays put, along the layer's own turn.
  const sideTo = (target: string, edge: string, dx: number, dy: number) => {
    const cu = isPack ? null : customOf(target);
    const c = cu && beginCustom(target, 'Resize');
    if (!cu || !c) return;
    const a = (cu.l.rotate * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
    const ex = dx * cs + dy * sn, ey = -dx * sn + dy * cs;
    const { x, y, w, h } = c.box;
    const nw = edge === 'e' ? Math.max(20, w + ex) : edge === 'w' ? Math.max(20, w - ex) : w;
    const nh = edge === 's' ? Math.max(20, h + ey) : edge === 'n' ? Math.max(20, h - ey) : h;
    const lx = (edge === 'e' ? 1 : edge === 'w' ? -1 : 0) * (nw - w) / 2, ly = (edge === 's' ? 1 : edge === 'n' ? -1 : 0) * (nh - h) / 2;
    const cx = x + w / 2 + lx * cs - ly * sn, cy = y + h / 2 + lx * sn + ly * cs;
    patchCustom(c.view, c.id, { w: Math.round(nw), h: Math.round(nh), x: Math.round(cx - nw / 2), y: Math.round(cy - nh / 2) });
  };
  // Rotate handle: `deg` comes from the preview (already snapped to 15 with Shift).
  const rotateTo = (target: string, deg: number) => {
    const c = isPack ? null : beginCustom(target, 'Rotate');
    if (c) patchCustom(c.view, c.id, { rotate: Math.round((((deg % 360) + 540) % 360) - 180) });
  };

  // Corner-handle resize: `factor` is the pointer's distance from the centre against where the press began (aspect kept).
  const resizeTo = (target: string, wholeView: boolean, factor: number) => {
    if (isPack) return;
    if (!wholeView && target.startsWith('custom:')) {
      // A plain box resize about the centre (the turn and anchor come with free transform).
      const c = beginCustom(target, 'Resize');
      if (!c) return;
      const w = Math.max(10, Math.round(c.box.w * factor)), h = Math.max(10, Math.round(c.box.h * factor));
      patchCustom(c.view, c.id, { w, h, x: Math.round(c.box.x + (c.box.w - w) / 2), y: Math.round(c.box.y + (c.box.h - h) / 2) });
      return;
    }
    if (!drag.current) {
      const view = wholeView ? mode : viewOf(target);
      const ids = wholeView ? [] : editable(target);
      if (!wholeView && !ids.length) return;
      const id = wholeView ? null : ids.includes(target) ? target : ids[0];
      commit();
      tagEdit(wholeView ? `Resize ${VIEW_NAMES[view]}` : layersLabel('Resize', ids));
      const group = ids.map(i => ({ id: i, ox: elementAt(view, i).offsetX, oy: elementAt(view, i).offsetY, s0: elementAt(view, i).scale }));
      drag.current = { view, id, ox: 0, oy: 0, s0: (id ? elementAt(view, id) : layout[view]).scale, group };
    }
    const { view, id, s0 = 1, group } = drag.current;
    const clampScale = (s: number) => Math.round(Math.min(3, Math.max(0.25, s)) * 100) / 100;
    if (id) setElements(view, Object.fromEntries((group ?? []).map(g => {
      const scale = clampScale(g.s0 * factor), size = sizes.current[g.id];
      if (!size) return [g.id, { scale }];
      const vs = layout[view].scale, d = anchorOffset({ x: 0, y: 0, w: size.w * g.s0 * vs, h: size.h * g.s0 * vs }, anchor, g.s0, scale, vs);
      return [g.id, { scale, offsetX: Math.round(g.ox + d.dx), offsetY: Math.round(g.oy + d.dy) }];
    })));
    else setLayoutVals(l => ({ ...l, [view]: { ...l[view], scale: clampScale(s0 * factor) } }));
  };

  // Right-click menu on a layer (a preview part, a Layers row or a view heading); `id` null = the whole view.
  const sceneKeys = presets.map(x => 'scene:' + x.id).filter(k => k !== layoutKey);
  const resetLayer = (view: Mode, id: string | null) => {
    tagEdit(`Reset ${id ? LAYER_NAMES[id as ElementId] : VIEW_NAMES[view]}`);
    setLayoutVals(l => {
      if (!id) return { ...l, [view]: { ...l[view], scale: 1, offsetX: 0, offsetY: 0 } };
      const { [id as ElementId]: _gone, ...elements } = l[view].elements ?? {};
      return { ...l, [view]: { ...l[view], elements } };
    });
  };
  // Only a whole view can be centred: a part's offset is relative to its normal spot, which is not the stage centre.
  const centerLayer = (view: Mode) => setLayoutVals(l => ({ ...l, [view]: { ...l[view], offsetX: 0, offsetY: 0 } }), `Center ${VIEW_NAMES[view]}`);
  const copyLayerToScenes = (view: Mode, id: string | null) => {
    const src = id ? layout[view].elements?.[id as ElementId] : { scale: layout[view].scale, offsetX: layout[view].offsetX, offsetY: layout[view].offsetY };
    tagEdit('Copy layout to scenes');
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
    if (target.startsWith('custom:')) {
      const c = beginCustom(target, 'Move');
      if (c) patchCustom(c.view, c.id, { x: Math.round(c.box.x + dx), y: Math.round(c.box.y + dy) });
      return;
    }
    if (!drag.current) {
      const view = viewOf(target);
      const ids = shift ? [] : editable(target);
      if (!shift && !ids.length) return;
      const id = shift ? null : ids.includes(target) ? target : ids[0];
      commit();
      tagEdit(shift ? `Move ${VIEW_NAMES[view]}` : layersLabel('Move', ids));
      const start = id ? elementAt(view, id) : layout[view];
      const group = ids.map(i => ({ id: i, ox: elementAt(view, i).offsetX, oy: elementAt(view, i).offsetY, s0: 1 }));
      drag.current = { view, id, ox: start.offsetX, oy: start.offsetY, group };
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
    if (id) setElements(view, Object.fromEntries((drag.current.group ?? []).map(g => [g.id, { offsetX: g.ox + nx - drag.current!.ox, offsetY: g.oy + ny - drag.current!.oy }])));
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
      if (tool === 'text' || tool === 'shape' || tool === 'image') setTool('move');
      else setSelected('');
      return true;
    }
    const step = shift ? 10 : 1;
    const m = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[key];
    if (!m) return false;
    if (!dragging) return true;
    const cu = selected.startsWith('custom:') ? customOf(selected) : null;
    if (cu) {
      tagEdit(`Nudge ${cu.l.name}`);
      patchCustom(cu.view, cu.l.id, { x: cu.l.x + m[0], y: cu.l.y + m[1] });
      return true;
    }
    const view = viewOf(selected);
    const ids = editable(selected);
    if (!ids.length) return true;
    tagEdit(layersLabel('Nudge', ids));
    setElements(view, Object.fromEntries(ids.map(i => { const cur = elementAt(view, i); return [i, { offsetX: cur.offsetX + m[0], offsetY: cur.offsetY + m[1] }]; })));
    return true;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (pressKey(e.key, e.shiftKey)) e.preventDefault();
  };

  // Select one element and open its category and section; the preview click and the Layers panel share this.
  const selectTarget = (target: string) => {
    setSelection([...linkSet(target).filter(t => t !== target), target]);
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
  // Shift+click: add a part to the selection, or take a selected one out. Only one view's parts can be selected together.
  const toggleSelect = (target: string) => {
    const set = linkSet(target);
    if (selection.includes(target)) setSelection(selection.filter(t => !set.includes(t)));
    else if (!selected || viewOf(selected) !== viewOf(target)) selectTarget(target);
    else setSelection([...selection.filter(t => !set.includes(t)), ...set.filter(t => t !== target), target]);
  };
  // Link / Unlink (ROADMAP 38.18): linked parts select together, so the group drag, resize and nudge move them as one.
  const linkSelection = () => {
    const ids = selection.filter(t => !t.startsWith('custom:'));
    if (isPack || ids.length < 2) return;
    const view = viewOf(ids[0]);
    setLayoutVals(l => {
      const old = l[view].links ?? [];
      const hit = old.filter(s => s.some(t => ids.includes(t)));
      return { ...l, [view]: { ...l[view], links: [...old.filter(s => !hit.includes(s)), [...new Set([...hit.flat(), ...ids])]] } };
    }, layersLabel('Link', ids));
  };
  const unlinkSelection = () => {
    if (isPack || !selection.some(t => linkSet(t).length > 1)) return;
    const view = viewOf(selected);
    setLayoutVals(l => {
      const links = (l[view].links ?? []).filter(s => !s.some(t => selection.includes(t)));
      const { links: _gone, ...rest } = l[view];
      return { ...l, [view]: links.length ? { ...rest, links } : rest };
    }, layersLabel('Unlink', selection));
  };
  // Align / distribute: the preview measures the parts, the editor turns each box move into an offset change (one History step).
  const boxesWait = useRef<((b: Record<string, DesignBox>) => void) | null>(null);
  const measureBoxes = (ids: string[]) => new Promise<Record<string, DesignBox>>(resolve => {
    const timer = setTimeout(() => { boxesWait.current = null; resolve({}); }, 1500);
    boxesWait.current = b => { clearTimeout(timer); boxesWait.current = null; resolve(b); };
    post({ type: 'measure', ids });
  });
  // With an off-centre anchor, learn each selected part's size at 100% (its box now over its scale and the view's) so a resize can shift it.
  useEffect(() => {
    if (isPack || !selection.length || (anchor.x === 0.5 && anchor.y === 0.5)) return;
    let live = true;
    void measureBoxes(selection).then(boxes => {
      if (!live) return;
      for (const [id, b] of Object.entries(boxes)) {
        const k = elementAt(viewOf(id), id).scale * layout[viewOf(id)].scale;
        if (k > 0) sizes.current[id] = { w: b.w / k, h: b.h / k };
      }
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, anchor, isPack]);
  const arrange = async (label: string, minParts: number, plan: (boxes: Record<string, DesignBox>, viewScale: number) => Record<string, { dx: number; dy: number }>) => {
    const ids = selection.filter(id => !locked.includes(id));
    if (isPack || ids.length < minParts) return;
    const view = viewOf(selected);
    const boxes = await measureBoxes(ids);
    const moves = plan(Object.fromEntries(Object.entries(boxes).filter(([id]) => ids.includes(id))), layout[view].scale || 1);
    const patches = Object.fromEntries(Object.entries(moves).map(([id, m]) => {
      const at = elementAt(view, id);
      return [id, { offsetX: Math.round(at.offsetX + m.dx), offsetY: Math.round(at.offsetY + m.dy) }];
    }));
    if (!Object.keys(patches).length) return;
    tagEdit(label);
    setElements(view, patches);
  };
  const ALIGN_LABELS: Record<AlignMode, string> = { left: 'Align left', center: 'Align centre', right: 'Align right', top: 'Align top', middle: 'Align middle', bottom: 'Align bottom' };
  const alignSelection = (mode: AlignMode) => arrange(ALIGN_LABELS[mode], 1, (b, k) => (Object.keys(b).length ? alignOffsets(b, mode, { w: layout.width, h: layout.height }, k) : {}));
  const distributeSelection = (axis: 'x' | 'y') => arrange(axis === 'x' ? 'Distribute horizontally' : 'Distribute vertically', 3, (b, k) => distributeOffsets(b, axis, k));
  const resetSelection = () => {
    if (!selection.length) return;
    tagEdit(layersLabel('Reset', selection));
    setLayoutVals(l => {
      const view = viewOf(selected);
      const elements = { ...l[view].elements };
      for (const id of selection) delete elements[id as ElementId];
      return { ...l, [view]: { ...l[view], elements } };
    });
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
    openLayerMenu(customOf(target)?.view ?? viewOf(target), target, r.left + x * fit, r.top + y * fit);
  };

  // Editor shortcuts, from this window and forwarded from the preview frame (t is null then). True when one was used.
  const shortcut = (key: string, ctrl: boolean, shift: boolean, t: HTMLElement | null, up = false): boolean => {
    const k = key.length === 1 ? key.toLowerCase() : key;
    if (up) {
      if (k === ' ') setSpaceDown(false);
      return false;
    }
    // Never while typing.
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || (t.tagName === 'INPUT' && ['text', 'search', 'number', 'url', ''].includes((t as HTMLInputElement).type)))) return false;
    if (ctrl) {
      if (k === 'z' && !shift) undo();
      else if (k === 'z' || k === 'y') redo();
      else if (k === 's') setSaveSignal(n => n + 1);
      else if (k === 'd') setSelected('');
      else if (k === 'j') duplicateSelected();
      else if (k === 'c' && selected.startsWith('custom:') && !window.getSelection()?.toString()) copySelected();
      else if (k === 'v' && clip.length) pasteClip();
      else if (k === 'r') toggleRulers();
      else if (k === '0') zoomFit();
      else if (k === '1') zoomActual();
      else if (k === '=' || k === '+') zoomStep(1);
      else if (k === '-') zoomStep(-1);
      else if ((k === '[' || k === ']') && selected.startsWith('custom:')) {
        const c = customOf(selected);
        if (c) setLayoutVals(l => ({ ...l, [c.view]: { ...l[c.view], custom: stepCustom(l[c.view].custom ?? [], c.l.id, k === '[' ? -1 : 1) } }), k === '[' ? `Send ${c.l.name} back` : `Bring ${c.l.name} forward`);
      }
      else return false;
      return true;
    }
    // In the Layers panel H is the layer's eye, not the Hand tool.
    if (k === 'h' && t?.closest('[data-layers]')) {
      t.closest('li')?.querySelector<HTMLButtonElement>('button[aria-pressed]')?.click();
      return true;
    }
    if (k === 'v' || k === 'h' || k === 'z' || k === 't' || k === 'u' || k === 'i') {
      setTool(k === 'v' ? 'move' : k === 'h' ? 'hand' : k === 'z' ? 'zoom' : k === 't' ? 'text' : k === 'u' ? 'shape' : 'image');
      return true;
    }
    if (k === '?') {
      setShortcutsOpen(true);
      return true;
    }
    if (t?.closest('button,a,summary,[role=menuitem]')) return false; // Space and Tab keep their normal job on controls
    if (k === ' ') {
      setSpaceDown(true);
      return true;
    }
    // Tab only toggles from the canvas, so keyboard users can still tab through the panels.
    if (k === 'Tab' && !shift && (!t || t.closest('[data-canvas]'))) {
      setFocusMode(v => !v);
      return true;
    }
    return false;
  };
  // A wheel turn forwarded from the preview frame: x / y are the frame's own pixels, so scale them by the fit to get screen position.
  const wheelFromFrame = (dx: number, dy: number, ctrl: boolean, shift: boolean, x: number, y: number) => {
    const r = frameRef.current?.getBoundingClientRect();
    if (r) wheel(dx, dy, ctrl, shift, r.left + x * fit, r.top + y * fit);
  };

  const live = useRef({ dragTo, resizeTo, sideTo, rotateTo, dragEnd, pressKey, selectTarget, toggleSelect, contextAt, shortcut, wheel, wheelFromFrame });
  live.current = { dragTo, resizeTo, sideTo, rotateTo, dragEnd, pressKey, selectTarget, toggleSelect, contextAt, shortcut, wheel, wheelFromFrame };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (live.current.shortcut(e.key, e.ctrlKey || e.metaKey, e.shiftKey, e.target as HTMLElement | null, e.type === 'keyup')) e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      if (live.current.wheel(e.deltaX, e.deltaY, e.ctrlKey || e.metaKey, e.shiftKey, e.clientX, e.clientY)) e.preventDefault();
    };
    const dropSpace = () => setSpaceDown(false);
    const box = boxRef.current;
    // Capture, so the admin-wide keyboard layer (which also listens for ?) sees a key the editor used as already handled.
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('blur', dropSpace);
    box?.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('blur', dropSpace);
      box?.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Tell the preview what is selected (a part, or a whole view in the Layout panel), whether it may be edited, and the snap switch.
  const viewSelected = !selected && category === 'layout';
  useEffect(() => {
    if (ready) post({ type: 'selected', target: selected, selection, locked, view: viewSelected && !isPack, canEdit: (dragging && selection.some(id => !locked.includes(id))) || (viewSelected && !isPack), snap: snapOn });
  }, [ready, loadedCount, selected, selection, locked, viewSelected, dragging, isPack, snapOn, post]);
  // The preview snaps a dragged part to the user's guides too.
  useEffect(() => {
    if (ready) post({ type: 'guides', x: [...guides.x, ...zones.flatMap(z => [z.x, z.x + z.w])], y: [...guides.y, ...zones.flatMap(z => [z.y, z.y + z.h])] });
  }, [ready, loadedCount, guides, zones, post]);
  // Layers warns about a part whose measured box overlaps a zone (the preview shows one view at a time, so only its parts are measured).
  useEffect(() => {
    if (!ready || !zones.length) { setOverlapIds(o => (o.length ? [] : o)); return; }
    let live = true;
    const t = setTimeout(() => {
      const ids = [...ELEMENT_IDS[mode], ...(layout[mode].custom ?? []).map(c => `custom:${c.id}`)];
      void measureBoxes(ids).then(b => { if (live) setOverlapIds(Object.entries(b).filter(([, x]) => zones.some(z => boxesOverlap(x, z))).map(([id]) => id)); });
    }, 400);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loadedCount, zones, layout, shownProps, mode]);

  const catId = isPack && category === 'collection' ? 'pack' : category;

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const data = e.data as { type?: string; target?: string; dx?: number; dy?: number; alt?: boolean; shift?: boolean; key?: string; ctrl?: boolean; up?: boolean; sx?: boolean; sy?: boolean; view?: boolean; factor?: number; edge?: string; deg?: number; x?: number; y?: number } | null;
      if (data?.type === 'drag' && data.target && Number.isFinite(data.dx) && Number.isFinite(data.dy)) {
        live.current.dragTo(data.target, data.dx as number, data.dy as number, !!data.alt, !!data.shift, !!data.sx, !!data.sy);
        return;
      }
      if (data?.type === 'resize' && typeof data.factor === 'number' && Number.isFinite(data.factor) && data.factor > 0) {
        live.current.resizeTo(data.target ?? '', !!data.view, data.factor);
        return;
      }
      if (data?.type === 'side' && data.target && typeof data.edge === 'string' && Number.isFinite(data.dx) && Number.isFinite(data.dy)) {
        live.current.sideTo(data.target, data.edge, data.dx as number, data.dy as number);
        return;
      }
      if (data?.type === 'rotate' && data.target && Number.isFinite(data.deg)) {
        live.current.rotateTo(data.target, data.deg as number);
        return;
      }
      if (data?.type === 'context' && data.target && Number.isFinite(data.x) && Number.isFinite(data.y)) {
        live.current.contextAt(data.target, data.x as number, data.y as number);
        return;
      }
      if (data?.type === 'fit') { setFitReport({ over: ((data as unknown as { over?: Record<string, number> }).over) ?? {}, stage: String((data as unknown as { stage?: string }).stage ?? '1280x720') }); return; }
      if (data?.type === 'timeline') {
        const m = data as unknown as { active: boolean; paused: boolean; t: number; dur: number; markers: Record<string, number> | null };
        setTimeline(m.active ? { paused: m.paused, t: m.t, dur: m.dur, markers: m.markers } : null);
        if (!m.active) setPlaying(false);
        pullWait.current?.({ active: m.active, cooldown: (m as { cooldown?: number }).cooldown ?? 1 });
        return;
      }
      if (data?.type === 'fps') { const m = data as unknown as { avg: number; worst: number }; if (Number.isFinite(m.avg) && Number.isFinite(m.worst)) setFps({ avg: m.avg, worst: m.worst }); return; }
      if (data?.type === 'boxes') { boxesWait.current?.((data as { boxes?: Record<string, DesignBox> }).boxes ?? {}); return; }
      if (data?.type === 'edit' && typeof data.target === 'string' && data.target.startsWith('custom:')) {
        live.current.selectTarget(data.target);
        setFocusText(data.target.slice(7));
        return;
      }
      if (data?.type === 'dragend') return live.current.dragEnd();
      if (data?.type === 'key' && typeof data.key === 'string') {
        if (!live.current.pressKey(data.key, !!data.shift)) live.current.shortcut(data.key, !!data.ctrl, !!data.shift, null, !!data.up);
        return;
      }
      if (data?.type === 'wheel' && Number.isFinite(data.dx) && Number.isFinite(data.dy) && Number.isFinite(data.x) && Number.isFinite(data.y)) {
        live.current.wheelFromFrame(data.dx as number, data.dy as number, !!data.ctrl, !!data.shift, data.x as number, data.y as number);
        return;
      }
      if (data?.type !== 'select' || !data.target) return;
      if (data.shift) live.current.toggleSelect(data.target);
      else live.current.selectTarget(data.target);
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
    selection,
    locked,
    toggleSelect,
    toggleLock,
    alignSelection,
    distributeSelection,
    resetSelection,
    linkSelection,
    unlinkSelection,
    selectTarget,
    selectView,
    hoverElement,
    layerMenu,
    openLayerMenu,
    closeLayerMenu,
    resetLayer,
    editLayer,
    anchor,
    setAnchor,
    centerLayer,
    copyLayerToScenes,
    sceneCount: sceneKeys.length,
    duplicateSelected, copySelected, pasteClip, hasClip: clip.length > 0,
    layoutOf,
    category,
    setCategory,
    openCat,
    setOpenCat,
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
    rehearsing,
    rehearse,
    stopRehearsal,
    timeline,
    fps,
    wordFit: fitReport.over,
    fitStage: fitReport.stage.replace('x', '×'),
    timelineCmd,
    previewProp,
    play,
    showGrid,
    setShowGrid,
    showThirds,
    setShowThirds,
    showSafe,
    setShowSafe,
    snapOn,
    setSnapOn,
    showRulers,
    toggleRulers,
    guides,
    setGuides,
    guidesLocked,
    setGuidesLocked,
    zones,
    setZones,
    overlapIds,
    zoom,
    setZoom,
    activeTool,
    setTool,
    addCustomAt,
    focusText,
    textTemplate,
    setTextTemplate,
    setFocusText,
    zoomStep,
    zoomFit,
    zoomActual,
    zoomTo,
    fitBase,
    focusMode,
    setFocusMode,
    shortcutsOpen,
    setShortcutsOpen,
    saveSignal,
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
    historyLabels: hist.current.labels,
    historyIndex: hist.current.i,
    jumpTo,
    tagEdit,
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
    scheduledLooks,
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

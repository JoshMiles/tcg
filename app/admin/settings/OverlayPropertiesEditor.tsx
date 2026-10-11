'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PROPS, PROP_BY_KEY, PROP_GROUPS, REVEAL_STYLES, cleanValue, exportProps, importProps,
  type PropDef, type PropValue, type PropValues,
} from '@/lib/overlay-props';
import type { OverlayLayout } from '@/lib/overlay-layout';

// Every adjustable property of the overlay, generated from the registry in lib/overlay-props.ts: the controls, reset
// buttons, presets and import/export all work off that one list. Values are stored sparsely (only what differs from the
// default). There are two scopes: Global, and per-pack overrides that sit on top of Global for that pack's reveals.
// The preview is the real overlay (/overlay.html?preview) fed the unsaved values by postMessage.

interface PackInfo { id: string; name: string }
interface PresetInfo { id: string; name: string; props: PropValues; updatedAt: number }

const VARIANT_CHOICES = [
  { id: '', label: 'Regular' },
  { id: 'reverse', label: 'Reverse Holo' },
  { id: 'full', label: 'Full Art' },
  { id: 'shiny', label: '✨ Shiny' },
];

const canon = (v: PropValues) => JSON.stringify(Object.keys(v).sort().map(k => [k, v[k]]));
const eq = (a: PropValue | undefined, b: PropValue | undefined) => JSON.stringify(a) === JSON.stringify(b);

// Which other property switches a property's controls on or off (so the panel can grey out what has no effect).
function dependsOn(key: string): { key: string; when: (v: PropValue) => boolean } | null {
  const m = key.match(/^(variant\.[a-z]+)\.(.+)$/);
  if (m) {
    const [, g, name] = m;
    if (/^glow(ColorA|ColorB|Blur|Spread|Speed)$/.test(name)) return { key: `${g}.glow`, when: v => v === true };
    if (/^pop(Scale|Tilt)$/.test(name)) return { key: `${g}.pop`, when: v => v === true };
    if (/^rock(Amount|Speed)$/.test(name)) return { key: `${g}.rock`, when: v => v === true };
    if (/^sparkle(Count|Color)$/.test(name)) return { key: `${g}.sparkles`, when: v => v === true };
    if (/^holo(Colors|Opacity|Speed|Angle|Blend|Loop)$/.test(name)) return { key: `${g}.holoMode`, when: v => v !== 'off' };
  }
  if (key === 'reveal.burstOpacity') return { key: 'reveal.showBurst', when: v => v === true };
  if (key === 'reveal.gotText') return { key: 'reveal.showGotLine', when: v => v === true };
  if (key === 'collection.headingText') return { key: 'collection.showHeading', when: v => v === true };
  return null;
}

export function OverlayPropertiesEditor({
  initialGlobal, initialPacks, packs, presets, layout, initialScope, saveAction, savePresetAction, deletePresetAction,
}: {
  initialGlobal: PropValues;
  initialPacks: Record<string, PropValues>;
  packs: PackInfo[];
  presets: PresetInfo[];
  layout: OverlayLayout;
  initialScope: string;
  saveAction: (formData: FormData) => void | Promise<void>;
  savePresetAction: (formData: FormData) => void | Promise<void>;
  deletePresetAction: (formData: FormData) => void | Promise<void>;
}) {
  const [globalVals, setGlobalVals] = useState<PropValues>(initialGlobal);
  const [packVals, setPackVals] = useState<Record<string, PropValues>>(initialPacks);
  const [scope, setScope] = useState<string>(initialScope === 'global' || packs.some(p => p.id === initialScope) ? initialScope : 'global');
  const [group, setGroup] = useState('reveal');
  const [previewVariant, setPreviewVariant] = useState('');
  const [ready, setReady] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [boxWidth, setBoxWidth] = useState(0);
  const [presetName, setPresetName] = useState('');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [notice, setNotice] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const isPack = scope !== 'global';
  const groups = PROP_GROUPS.filter(g => !(isPack && g.id === 'collection')); // the collection view isn't per-pack
  const activeGroup = groups.find(g => g.id === group) ?? groups[0];
  const current: PropValues = isPack ? packVals[scope] ?? {} : globalVals;

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
  const dirty = changedGlobal || changedPacks.length > 0;
  const payload = JSON.stringify({
    ...(changedGlobal ? { global: globalVals } : {}),
    packs: Object.fromEntries(changedPacks.map(id => [id, packVals[id] ?? {}])),
  });
  const revert = () => { setGlobalVals(initialGlobal); setPackVals(initialPacks); };

  // The values that apply at this scope, sparse: what the preview should show and what export/presets capture.
  const effectiveSparse: PropValues = useMemo(() => (isPack ? { ...globalVals, ...(packVals[scope] ?? {}) } : globalVals), [isPack, globalVals, packVals, scope]);

  // ── Preview plumbing ──
  const post = useCallback((message: object) => {
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    setBoxWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const d = frameRef.current?.contentDocument;
    if (d && d.readyState === 'complete' && d.location.href !== 'about:blank') { setReady(true); setLoadedCount(c => c + 1); }
  }, []);

  const mode = activeGroup.id === 'collection' ? 'collection' : 'pack';
  // Show the version being edited when a version's tab is open.
  useEffect(() => {
    const m = activeGroup.id.match(/^variant\.(.+)$/);
    if (m) setPreviewVariant(m[1] === 'regular' ? '' : m[1]);
  }, [activeGroup.id]);

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

  const previewScale = boxWidth > 0 ? boxWidth / layout.width : 0.3;
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
    catch { setNotice('Could not copy — use Download instead.'); }
  };
  const runImport = (text: string) => {
    try {
      const values = importProps(text);
      replaceCurrent(values);
      setImportError('');
      setImportText('');
      setNotice(`Imported ${Object.keys(values).length} setting${Object.keys(values).length === 1 ? '' : 's'} — review, then Save.`);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not import that.');
    }
  };
  const applyPreset = (p: PresetInfo) => {
    replaceCurrent(isPack ? { ...(packVals[scope] ?? {}), ...p.props } : { ...p.props });
    setNotice(`Applied "${p.name}" — review, then Save.`);
  };

  const modifiedIn = (groupId: string) => PROPS.some(d => d.group === groupId && current[d.key] !== undefined);
  const groupDefs = PROPS.filter(d => d.group === activeGroup.id);
  const anyModifiedInGroup = groupDefs.some(d => current[d.key] !== undefined);

  const btn = 'px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors';
  const ghost = `${btn} border border-gray-700 text-gray-200 hover:border-gray-500`;

  const rows = (defs: PropDef[]) => defs.map(def => {
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
  });

  // Rows are listed under their sub-headings, in the order the registry defines them.
  const sections = [...groupDefs.reduce((m, d) => m.set(d.section ?? '', [...(m.get(d.section ?? '') ?? []), d]), new Map<string, PropDef[]>())];

  return (
    <div data-sticky-host className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] items-start">
      {/* ── Controls ── */}
      <div className="space-y-4 min-w-0 order-2 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1">
        {/* Scope */}
        <div className="rounded-lg bg-gray-950/60 border border-gray-800 p-3 space-y-2">
          <label className="flex flex-wrap items-center gap-3 text-sm text-gray-300 font-semibold">
            Editing
            <select
              value={scope}
              onChange={e => setScope(e.target.value)}
              className="rounded-md bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm text-white focus:border-yellow-500 focus:outline-none"
            >
              <option value="global">Everything (global settings)</option>
              {packs.map(p => (
                <option key={p.id} value={p.id}>
                  Override for pack: {p.name}{Object.keys(packVals[p.id] ?? {}).length ? ' ●' : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-gray-500 leading-relaxed">
            {isPack
              ? <>Only the settings you change here apply to this pack; everything else follows the global settings. A <span className="text-yellow-400">●</span> marks a value this pack overrides. The collection view isn&rsquo;t pack-specific, so it isn&rsquo;t listed.</>
              : <>These apply to every pack unless a pack overrides them. Only values that differ from the defaults are saved. A <span className="text-yellow-400">●</span> marks a value you&rsquo;ve changed.</>}
          </p>
        </div>

        {/* Presets / import / export */}
        <details className="rounded-lg bg-gray-950/60 border border-gray-800 group/p">
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-gray-300 flex items-center justify-between">
            <span>Presets, import &amp; export</span>
            <span className="text-xs text-gray-500 font-normal">{presets.length} saved preset{presets.length === 1 ? '' : 's'}</span>
          </summary>
          <div className="px-3 pb-3 space-y-4 text-sm">
            <div className="space-y-2">
              <p className="text-xs text-gray-500">A preset is a named set of {isPack ? 'this pack’s effective' : 'global'} values you can apply later{isPack ? ' to any pack' : ''}.</p>
              {presets.length === 0 && <p className="text-xs text-gray-600">No presets yet.</p>}
              <ul className="space-y-1">
                {presets.map(p => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-gray-200">{p.name} <span className="text-gray-600 text-xs">· {Object.keys(p.props).length} changed</span></span>
                    <button type="button" onClick={() => applyPreset(p)} className={`${btn} border border-gray-700 text-gray-200 hover:border-yellow-500 py-1`}>Apply</button>
                    <form action={deletePresetAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="scope" value={scope} />
                      <button type="submit" className={`${btn} text-gray-500 hover:text-red-300 py-1`} aria-label={`Delete preset ${p.name}`}>Delete</button>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={savePresetAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="props" value={JSON.stringify(effectiveSparse)} />
                <input type="hidden" name="scope" value={scope} />
                <input
                  name="name"
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  maxLength={40}
                  placeholder="Preset name (saving over a name replaces it)"
                  className="flex-1 min-w-[12rem] rounded-md bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm text-white focus:border-yellow-500 focus:outline-none"
                />
                <button type="submit" disabled={!presetName.trim()} className={`${ghost} disabled:opacity-40`}>Save as preset</button>
              </form>
              {dirty && <p className="text-xs text-yellow-500/80">Presets capture what you see in the preview, including unsaved changes.</p>}
            </div>

            <div className="space-y-2 border-t border-gray-800 pt-3">
              <p className="text-xs text-gray-500">Share or back up a look as JSON. Importing replaces the values at the current scope (you can still Revert).</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={download} className={ghost}>⬇ Download JSON</button>
                <button type="button" onClick={copyJson} className={ghost}>Copy JSON</button>
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
          </div>
        </details>
        {notice && <p role="status" className="text-xs text-green-300">{notice}</p>}

        {/* Group tabs */}
        <div role="tablist" aria-label="Property groups" className="flex flex-wrap gap-2">
          {groups.map(g => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={activeGroup.id === g.id}
              onClick={() => setGroup(g.id)}
              className={`${btn} border flex items-center gap-1.5 ${activeGroup.id === g.id ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
            >
              <span aria-hidden>{g.icon}</span> {g.label}
              {modifiedIn(g.id) && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" title={isPack ? 'Overrides in this group' : 'Changed from the default'} />}
            </button>
          ))}
        </div>

        {/* The active group */}
        <section className="tcg-panel rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-white">{activeGroup.icon} {activeGroup.label}</h3>
              <p className="text-xs text-gray-500">{activeGroup.description}</p>
            </div>
            <button
              type="button"
              disabled={!anyModifiedInGroup}
              onClick={() => resetKeys(groupDefs.map(d => d.key))}
              className={`${btn} text-gray-400 hover:text-white disabled:opacity-30 py-1`}
            >
              {isPack ? 'Clear overrides in this group' : 'Reset this group'}
            </button>
          </div>

          {sections.map(([name, defs]) => (
            <div key={name} className="space-y-3 border-t border-gray-800 pt-3 first:border-0 first:pt-0">
              {name && <h4 className="text-xs uppercase tracking-wide text-gray-500 font-semibold">{name}</h4>}
              {rows(defs)}
            </div>
          ))}
        </section>

        {/* Save */}
        <form action={saveAction} className="flex flex-wrap items-center gap-3 sticky bottom-3 z-10 rounded-xl bg-gray-900/95 border border-gray-800 backdrop-blur px-3 py-2.5">
          <input type="hidden" name="payload" value={payload} />
          <input type="hidden" name="scope" value={scope} />
          <button type="submit" disabled={!dirty} className={`${btn} bg-yellow-500 text-gray-950 hover:bg-yellow-400 disabled:opacity-40`}>Save</button>
          <button type="button" disabled={!dirty} onClick={revert} className={`${btn} text-gray-400 hover:text-white disabled:opacity-40`}>Revert</button>
          <span className="text-xs text-gray-500 ml-auto">
            {dirty
              ? <span className="text-yellow-500">Unsaved: {[changedGlobal && 'global', ...changedPacks.map(id => packs.find(p => p.id === id)?.name ?? id)].filter(Boolean).join(', ')}</span>
              : 'All changes saved. Refresh the OBS browser source to pick them up.'}
          </span>
        </form>
      </div>

      {/* ── Preview ── */}
      <div className="space-y-2 xl:sticky xl:top-4 order-1 min-w-0">
        <div
          ref={boxRef}
          className="relative w-full overflow-hidden rounded-lg border border-gray-700"
          style={{
            height: layout.height * previewScale,
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
              transform: `scale(${previewScale})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
            }}
          />
          {!ready && <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">Loading preview…</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'pack' && (
            <div role="group" aria-label="Preview as" className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-500 mr-1">Preview as</span>
              {VARIANT_CHOICES.map(v => (
                <button
                  key={v.id || 'regular'}
                  type="button"
                  aria-pressed={previewVariant === v.id}
                  onClick={() => setPreviewVariant(v.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${previewVariant === v.id ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
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
        <p className="text-xs text-gray-500 leading-relaxed">
          Live preview with your unsaved values. The still shows the moment the card has settled; <strong className="text-gray-400">Play</strong> runs the real animation
          {mode === 'pack' ? <> as the chosen version{isPack ? ' with this pack’s art' : ''}</> : null}. Nothing here touches real collections.
        </p>
      </div>
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
  return (
    <div className={`space-y-1 ${off ? 'opacity-45' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <label htmlFor={id} className="text-sm text-gray-200 font-medium">
          {def.label}
          {modified && <span className="ml-1.5 text-yellow-400" title={isPack ? 'Overridden for this pack' : 'Changed from the default'}>●</span>}
          {inherited && <span className="ml-1.5 text-xs text-gray-600 font-normal">(from global)</span>}
          {def.experimental && <span className="ml-1.5 text-[10px] uppercase tracking-wide rounded bg-purple-500/20 text-purple-300 px-1.5 py-0.5 font-semibold">experimental</span>}
        </label>
        <button
          type="button"
          onClick={onReset}
          disabled={!modified}
          className="text-xs text-gray-500 hover:text-white disabled:opacity-0 shrink-0"
          title={isPack ? 'Stop overriding (use the global value)' : `Reset to ${formatValue(def, def.default)}`}
        >
          {isPack ? 'inherit' : 'reset'}
        </button>
      </div>
      <Control def={def} id={id} value={value} onChange={onChange} />
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

'use client';
import { useState, type Dispatch, type SetStateAction } from 'react';
import type { ScheduledLook } from '@/lib/overlay-settings';
import { Icon } from '@/app/components/Icon';
import { PendingButton } from '../components/PendingButton';
import { PROP_BY_KEY, mergePropValues, type PropValues } from '@/lib/overlay-props';
import { isVertical, type OverlayLayout } from '@/lib/overlay-layout';
import { diffProps, type DiffLine } from '@/lib/overlay-diff';
import { addScheduledLookAction, deleteOverlayVersionAction, removeScheduledLookAction, setSeasonLookAction } from '../overlay-actions';
import { Popover, btn, ghost } from './editor-controls';
import { SubMenu } from '../components/workspace/MenuBar';
import type { Bg, PackInfo, PresetInfo, SeasonInfo, VersionInfo } from './editor-types';

// The flyouts of the Overlay Editor's menu bar (File, Edit, View, Scene), plus Review and the banners. All state stays in OverlayEditor and arrives as props.

type FormAction = (formData: FormData) => void | Promise<void>;
type Notify = (message: string) => void;

export function PresetsMenu({ presets, isPack, scope, dirty, effectiveSparse, applyPreset, deletePresetAction, savePresetAction, presetName, setPresetName, seasons, scheduledLooks, looks, setLooks, setNotice }: { scheduledLooks: ScheduledLook[]; presets: PresetInfo[]; isPack: boolean; scope: string; dirty: boolean; effectiveSparse: PropValues; applyPreset: (p: PresetInfo) => void; deletePresetAction: FormAction; savePresetAction: FormAction; presetName: string; setPresetName: (v: string) => void; seasons: SeasonInfo[]; looks: Record<string, string>; setLooks: Dispatch<SetStateAction<Record<string, string>>>; setNotice: Notify }) {
  return (
    <SubMenu label="Looks" icon="palette" badge={presets.length || undefined}>
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
            className="input input-sm flex-1 min-w-0"
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
                  className="select select-sm max-w-36"
                >
                  <option value="">Global look</option>
                  {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}

        {presets.length > 0 && <ScheduledLooks presets={presets} scheduled={scheduledLooks} setNotice={setNotice} />}
      </div>
    </SubMenu>
  );
}

// Times are typed and shown in this browser's time zone (there is no streamer time zone setting); stored as UTC epoch ms.
const zoneName = () => new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? '';
const showTime = (ms: number) => new Date(ms).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZoneName: 'short', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });

function ScheduledLooks({ presets, scheduled, setNotice }: { presets: PresetInfo[]; scheduled: ScheduledLook[]; setNotice: Notify }) {
  const [presetId, setPresetId] = useState(presets[0].id);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const now = Date.now();
  return (
    <div className="border-t border-gray-800 pt-3 space-y-2">
      <p className="text-xs font-semibold text-gray-300">Scheduled looks</p>
      <p className="text-xs text-gray-500">A preset that switches on at a start time and off at an end (a Halloween stream), layered over the season look. Times are in your browser&apos;s time zone ({zoneName()}). An idle overlay reloads by itself at each edge. Applied immediately, no Save needed.</p>
      <ul className="space-y-1">
        {scheduled.map(e => (
          <li key={e.id} className="flex items-center gap-2 text-xs text-gray-400">
            <span className="flex-1 min-w-0">
              <span className="text-gray-200">{presets.find(p => p.id === e.presetId)?.name ?? 'Deleted preset'}</span>
              {e.start <= now && now < e.end && <span className="ml-1 text-green-400">(active)</span>}
              {e.end <= now && <span className="ml-1 text-gray-600">(ended)</span>}
              <br />{showTime(e.start)} to {showTime(e.end)}
            </span>
            <button type="button" onClick={async () => setNotice((await removeScheduledLookAction(e.id)).message)} className={`${btn} text-gray-500 hover:text-red-300 py-1`}>Remove</button>
          </li>
        ))}
      </ul>
      <select value={presetId} onChange={e => setPresetId(e.target.value)} aria-label="Preset to schedule" className="select select-sm w-full">
        {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <label className="flex items-center gap-2 text-xs text-gray-400"><span className="w-10">Start</span><input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className="input input-sm flex-1 min-w-0" /></label>
      <label className="flex items-center gap-2 text-xs text-gray-400"><span className="w-10">End</span><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className="input input-sm flex-1 min-w-0" /></label>
      <button
        type="button"
        disabled={!start || !end}
        onClick={async () => {
          const r = await addScheduledLookAction(presetId, new Date(start).getTime(), new Date(end).getTime());
          if (r.ok) { setStart(''); setEnd(''); }
          setNotice(r.message);
        }}
        className={`${ghost} disabled:opacity-40`}
      >Schedule</button>
    </div>
  );
}

export function ScenesMenu({ presets, initialLayout, globalLayout, siteUrl, overlayKey, scope, setScope, setNotice, savePresetAction, presetName, setPresetName, dirty }: { presets: PresetInfo[]; initialLayout: OverlayLayout; globalLayout: OverlayLayout; siteUrl: string; overlayKey: string; scope: string; setScope: (v: string) => void; setNotice: Notify; savePresetAction: FormAction; presetName: string; setPresetName: (v: string) => void; dirty: boolean }) {
  return (
    <SubMenu label="Scenes" icon="tv" badge={presets.length || undefined}>
      <div className="w-104 max-w-[85vw] space-y-3 text-sm">
        <p className="text-xs text-gray-500">
          A scene has its own overlay URL, so each OBS scene (a vertical one, a different canvas size) can use its own size, position and look.
          Put the URL in that scene&apos;s browser source. Everything a scene does not change follows the global look.
        </p>
        <ul className="space-y-1.5 max-h-64 overflow-y-auto">
          {[{ id: '', name: 'Everything (global)', size: `${initialLayout.width} × ${initialLayout.height}`, own: true }, ...presets.map(x => {
            const l = x.layout;
            return { id: x.id, name: x.name, size: l ? `${l.width} × ${l.height}${isVertical(l) ? ' · vertical' : ''}` : 'uses the global layout', own: !!l };
          })].map(row => {
            const url = `${siteUrl}/overlay.html?${row.id ? 'preset=' + row.id + '&' : ''}key=${overlayKey}`;
            const key = row.id ? 'scene:' + row.id : 'global';
            return (
              <li key={row.id || 'global'} className={`rounded-lg border px-2.5 py-2 space-y-1.5 ${scope === key ? 'border-yellow-500/60 bg-yellow-500/5' : 'border-gray-800'}`}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate text-gray-200 font-semibold">{row.name}</span>
                  <span className="text-[11px] text-gray-500 shrink-0">{row.size}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 min-w-0 truncate rounded-sm bg-gray-950 border border-gray-800 px-1.5 py-1 text-[11px] text-gray-400">{url}</code>
                  <button type="button" onClick={() => navigator.clipboard.writeText(url).then(() => setNotice(`Copied the URL for "${row.name}".`), () => setNotice('Could not copy. Select the URL instead.'))} className={`${btn} border border-gray-700 text-gray-200 hover:border-yellow-500 py-1`}>Copy</button>
                  <a href={url} target="_blank" rel="noreferrer" className={`${btn} border border-gray-700 text-gray-200 hover:border-yellow-500 py-1`} aria-label={`Open the overlay for ${row.name}`}>Open</a>
                  <button type="button" onClick={() => setScope(key)} disabled={scope === key} className={`${btn} border border-gray-700 text-gray-200 hover:border-yellow-500 py-1 disabled:opacity-40`}>Edit</button>
                </div>
              </li>
            );
          })}
        </ul>
        <form action={savePresetAction} className="border-t border-gray-800 pt-3 space-y-2">
          <p className="text-xs font-semibold text-gray-300">New scene</p>
          <input type="hidden" name="props" value="{}" />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="layout" value={JSON.stringify(globalLayout)} />
          <div className="flex items-center gap-2">
            <input name="name" value={presetName} onChange={e => setPresetName(e.target.value)} maxLength={40} placeholder="e.g. Vertical, Just chatting" className="input input-sm flex-1 min-w-0" />
            <select name="sceneKind" defaultValue="landscape" aria-label="Orientation" className="select select-sm">
              <option value="landscape">Landscape</option>
              <option value="vertical">Vertical</option>
            </select>
            <PendingButton type="submit" disabled={!presetName.trim() || dirty} className={`${ghost} disabled:opacity-40`}>Create</PendingButton>
          </div>
          {dirty ? <p className="text-xs text-yellow-500/80">Creating a scene reloads the page. Save your changes first.</p> : <p className="text-xs text-gray-600">Landscape starts from the global layout; vertical starts from a 1080 × 1920 stage. Then adjust it under Layout.</p>}
        </form>
      </div>
    </SubMenu>
  );
}

export function VersionsMenu({ versionList, setVersionList, versionDistance, loadVersion, onCompare }: { versionList: VersionInfo[]; setVersionList: Dispatch<SetStateAction<VersionInfo[]>>; versionDistance: (v: VersionInfo) => number; loadVersion: (v: VersionInfo) => void; onCompare: (id: string) => void }) {
  return (
    <SubMenu label="Versions" icon="history" badge={versionList.length || undefined}>
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
                  <span className="block text-[11px] text-gray-500">{new Date(v.at).toLocaleString('en-GB', { timeZone: 'UTC' })} · {dist === 0 ? 'same as now' : `${dist} difference${dist === 1 ? '' : 's'} from your edit`}</span>
                </span>
                <button type="button" disabled={dist === 0} onClick={() => loadVersion(v)} className={`${btn} border border-gray-700 text-gray-200 hover:border-yellow-500 py-1 disabled:opacity-40`}>Load</button>
                <button type="button" onClick={() => onCompare(v.id)} className={`${btn} border border-gray-700 text-gray-200 hover:border-yellow-500 py-1`}>Compare</button>
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
    </SubMenu>
  );
}

export function ImportExportMenu({ download, copyJson, runImport, importText, setImportText, importError, setImportError }: { download: () => void; copyJson: () => void; runImport: (text: string) => void; importText: string; setImportText: (v: string) => void; importError: string; setImportError: (v: string) => void }) {
  return (
    <SubMenu label="Import / Export" icon="download">
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
          className="textarea w-full font-mono"
        />
        <div className="flex items-center gap-3">
          <button type="button" disabled={!importText.trim()} onClick={() => runImport(importText)} className={`${ghost} disabled:opacity-40`}>Import pasted JSON</button>
          {importError && <span role="alert" className="text-xs text-red-300">{importError}</span>}
        </div>
      </div>
    </SubMenu>
  );
}

export function PackToolsMenu({ packs, packVals, setPackVals, scope, globalVals, copyTargets, setCopyTargets, copyFrom, setCopyFrom, replaceCurrent, setNotice }: { packs: PackInfo[]; packVals: Record<string, PropValues>; setPackVals: Dispatch<SetStateAction<Record<string, PropValues>>>; scope: string; globalVals: PropValues; copyTargets: string[]; setCopyTargets: Dispatch<SetStateAction<string[]>>; copyFrom: string; setCopyFrom: (v: string) => void; replaceCurrent: (next: PropValues) => void; setNotice: Notify }) {
  return (
    <SubMenu label="Pack tools" icon="copy">
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
            <select value={copyFrom} onChange={e => setCopyFrom(e.target.value)} aria-label="Copy overrides from" className="select select-sm flex-1 min-w-0">
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
              {diffProps('', globalVals, mergePropValues(globalVals, packVals[scope]), k => PROP_BY_KEY[k]?.default).map((d, i) => (
                <li key={i} className="text-xs text-gray-400"><span className="text-gray-300">{d.label}</span> <span className="text-gray-600">{d.from} → </span><span className="text-yellow-300">{d.to}</span></li>
              ))}
            </ul>
          )}
          <button type="button" disabled={Object.keys(packVals[scope] ?? {}).length === 0} onClick={() => { replaceCurrent({}); setNotice('Cleared this pack’s overrides. Review, then Save.'); }} className={`${btn} text-gray-400 hover:text-red-300 px-0 disabled:opacity-40`}>Clear all overrides</button>
        </div>
      </div>
    </SubMenu>
  );
}

export function DiffList({ diffs }: { diffs: DiffLine[] }) {
  return (
    <ul className="max-h-80 overflow-y-auto divide-y divide-gray-800/70">
      {diffs.map((d, i) => (
        <li key={i} className="py-1.5 text-xs">
          <span className="text-[10px] uppercase tracking-wide text-gray-600">{d.scope}</span>
          <span className="block text-gray-200">{d.label}</span>
          <span className="text-gray-500">{d.from}</span> <span className="text-gray-600">→</span> <span className="text-yellow-300">{d.to}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReviewMenu({ diffs, dirty, openSignal }: { diffs: DiffLine[]; dirty: boolean; openSignal?: number }) {
  return (
    <Popover label={`Review${diffs.length ? ` (${diffs.length})` : ''}`} icon="list" align="right" disabled={!dirty} openSignal={openSignal}>
      <div className="w-104 max-w-[85vw] space-y-2 text-sm">
        <p className="text-xs text-gray-500">Everything that differs from what is saved. Nothing goes live until you Save.</p>
        <DiffList diffs={diffs} />
      </div>
    </Popover>
  );
}

/** Shown when Save was refused because someone saved a newer version while this editor was open. */
export function ConflictBanner({ version, diffs, overwrite, loadTheirs }: { version: VersionInfo; diffs: DiffLine[]; overwrite: () => void; loadTheirs: () => void }) {
  const btn = 'px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-700 text-gray-200 hover:border-gray-500';
  return (
    <div role="alert" className="basis-full flex flex-wrap items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-950/30 px-3 py-2 text-sm text-yellow-200">
      <Icon name="alert" />
      <span>Not saved. Someone saved a newer version at {new Date(version.at).toLocaleString('en-GB', { timeZone: 'UTC' })} (UTC){version.note ? `: ${version.note}` : ''}.</span>
      <Popover label="Review their changes" icon="list">
        <div className="w-104 max-w-[85vw] space-y-2 text-sm">
          <p className="text-xs text-gray-500">How their saved version differs from what you have now (their value on the left, yours on the right).</p>
          <DiffList diffs={diffs} />
        </div>
      </Popover>
      <button type="button" onClick={overwrite} className={btn}>Overwrite</button>
      <button type="button" onClick={loadTheirs} className={btn}>Load theirs</button>
    </div>
  );
}

/** Offered on open when an unsaved draft from an earlier session is in localStorage. */
export function DraftBanner({ at, stale, restore, discard }: { at: number; stale: boolean; restore: () => void; discard: () => void }) {
  return (
    <div role="status" className="basis-full flex flex-wrap items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-950/20 px-3 py-2 text-sm text-sky-200">
      <Icon name="history" />
      <span>Restore unsaved changes from {new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC?{stale ? ' They were made against an older saved version; Review opens after restoring.' : ''}</span>
      <button type="button" onClick={restore} className={ghost}>Restore</button>
      <button type="button" onClick={discard} className={ghost}>Discard</button>
    </div>
  );
}

export function SaveOptionsMenu({ note, setNote, autoReload, setAutoReload }: { note: string; setNote: (v: string) => void; autoReload: boolean; setAutoReload: (v: boolean) => void }) {
  return (
    <SubMenu label="Save options" icon="settings">
      <div className="w-72 space-y-3 text-sm">
        <label className="block text-xs text-gray-400 space-y-1">Version note (optional)
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={80} placeholder="e.g. Brighter shiny glow" className="input input-sm w-full" />
        </label>
        <label className="flex items-start gap-2 text-xs text-gray-300"><input type="checkbox" role="switch" checked={autoReload} onChange={e => setAutoReload(e.target.checked)} className="toggle toggle-xs toggle-primary mt-0.5" /><span>Refresh open overlays after saving. They reload once nothing is animating, so a pack opening is never cut short.</span></label>
      </div>
    </SubMenu>
  );
}

export function GuidesMenu({ showThirds, setShowThirds, showGrid, setShowGrid, showSafe, setShowSafe, snapOn, setSnapOn, zoom, setZoom, bg, setBg, bgImage, setBgImage }: { showThirds: boolean; setShowThirds: (v: boolean) => void; showGrid: boolean; setShowGrid: (v: boolean) => void; showSafe: boolean; setShowSafe: (v: boolean) => void; snapOn: boolean; setSnapOn: (v: boolean) => void; zoom: number; setZoom: (v: number) => void; bg: Bg; setBg: (v: Bg) => void; bgImage: string | null; setBgImage: (v: string | null) => void }) {
  const pickScreenshot = (f: File) => {
    if (bgImage) URL.revokeObjectURL(bgImage);
    setBgImage(URL.createObjectURL(f));
    setBg('image');
  };
  return (
    <SubMenu label="Guides, zoom and background" icon="grid">
      <div className="w-64 space-y-3 text-sm">
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" role="switch" checked={showThirds} onChange={e => setShowThirds(e.target.checked)} className="toggle toggle-xs toggle-primary" />Rule of thirds</label>
          <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" role="switch" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} className="toggle toggle-xs toggle-primary" />10% grid</label>
          <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" role="switch" checked={showSafe} onChange={e => setShowSafe(e.target.checked)} className="toggle toggle-xs toggle-primary" />Safe areas (5% and 10%)</label>
          <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" role="switch" checked={snapOn} onChange={e => setSnapOn(e.target.checked)} className="toggle toggle-xs toggle-primary" />Snap to centre / 10 px when dragging <span className="text-gray-600">(Alt = free)</span></label>
        </div>
        <label className="block text-xs text-gray-400 space-y-1">Zoom
          <select value={zoom} onChange={e => setZoom(Number(e.target.value))} className="select select-sm w-full block">
            <option value={1}>Fit to the space</option><option value={1.5}>150%</option><option value={2}>200%</option><option value={3}>300%</option>
            {![1, 1.5, 2, 3].includes(zoom) && <option value={zoom}>Custom (see the status bar)</option>}
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
              if (f) pickScreenshot(f);
            }} />
          </label>
          <p className="text-[11px] text-gray-600">Or paste one with Ctrl+V. Only shown in this editor, never saved or uploaded.</p>
        </div>
      </div>
    </SubMenu>
  );
}

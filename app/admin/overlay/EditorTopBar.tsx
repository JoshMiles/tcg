'use client';

import { Icon } from '@/app/components/Icon';
import { PendingButton } from '../components/PendingButton';
import { btn } from './editor-controls';
import {
  GuidesMenu as _GuidesMenu, // not in topbar
  ImportExportMenu,
  PackToolsMenu,
  PresetsMenu,
  ReviewMenu,
  SaveOptionsMenu,
  ScenesMenu,
  VersionsMenu,
} from './EditorMenus';
import { refreshOverlayAction } from '../overlay-actions';
import { useOverlayEditor } from './OverlayEditorContext';

export function EditorTopBar() {
  const {
    scope,
    setScope,
    packs,
    presets,
    packVals,
    isPack,
    isScene,
    dirty,
    effectiveSparse,
    applyPreset,
    deletePresetAction,
    savePresetAction,
    presetName,
    setPresetName,
    seasons,
    looks,
    setLooks,
    setNotice,
    initialLayout,
    layoutOf,
    siteUrl,
    overlayKey,
    versionList,
    setVersionList,
    versionDistance,
    loadVersion,
    download,
    copyJson,
    runImport,
    importText,
    setImportText,
    importError,
    setImportError,
    globalVals,
    copyTargets,
    setCopyTargets,
    copyFrom,
    setCopyFrom,
    replaceCurrent,
    setPackVals,
    undo,
    redo,
    canUndo,
    canRedo,
    notice,
    changedLayout,
    changedGlobal,
    changedPacks,
    changedScenes,
    refreshing,
    startRefresh,
    diffs,
    saveAction,
    payload,
    note,
    setNote,
    autoReload,
    setAutoReload,
    revert,
  } = useOverlayEditor();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-900/80 border border-gray-800 px-3 py-2">
      <label className="flex items-center gap-2 text-xs text-gray-400 font-semibold">
        Editing
        <select value={scope} onChange={e => setScope(e.target.value)} className="select select-sm max-w-56">
          <option value="global">Everything (global)</option>
          {packs.map(p => (
            <option key={p.id} value={p.id}>
              Pack: {p.name}
              {Object.keys(packVals[p.id] ?? {}).length ? ' ●' : ''}
            </option>
          ))}
          {presets.length > 0 && (
            <optgroup label="Scenes (own overlay URL)">
              {presets.map(x => (
                <option key={x.id} value={'scene:' + x.id}>
                  Scene: {x.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {isPack && (
        <span className="text-xs text-yellow-300/80 hidden md:inline">
          Only what you change applies to this pack; the rest follows global.
        </span>
      )}
      {isScene && (
        <span className="text-xs text-sky-300/80 hidden md:inline">
          This scene has its own overlay URL and layout; only what you change differs from the global look.
        </span>
      )}

      <PresetsMenu
        presets={presets}
        isPack={isPack}
        scope={scope}
        dirty={dirty}
        effectiveSparse={effectiveSparse}
        applyPreset={applyPreset}
        deletePresetAction={deletePresetAction}
        savePresetAction={savePresetAction}
        presetName={presetName}
        setPresetName={setPresetName}
        seasons={seasons}
        looks={looks}
        setLooks={setLooks}
        setNotice={setNotice}
      />

      <ScenesMenu
        presets={presets}
        initialLayout={initialLayout}
        globalLayout={layoutOf('global')}
        siteUrl={siteUrl}
        overlayKey={overlayKey}
        scope={scope}
        setScope={setScope}
        setNotice={setNotice}
        savePresetAction={savePresetAction}
        presetName={presetName}
        setPresetName={setPresetName}
        dirty={dirty}
      />

      <VersionsMenu
        versionList={versionList}
        setVersionList={setVersionList}
        versionDistance={versionDistance}
        loadVersion={loadVersion}
      />

      <ImportExportMenu
        download={download}
        copyJson={copyJson}
        runImport={runImport}
        importText={importText}
        setImportText={setImportText}
        importError={importError}
        setImportError={setImportError}
      />

      {isPack && (
        <PackToolsMenu
          packs={packs}
          packVals={packVals}
          setPackVals={setPackVals}
          scope={scope}
          globalVals={globalVals}
          copyTargets={copyTargets}
          setCopyTargets={setCopyTargets}
          copyFrom={copyFrom}
          setCopyFrom={setCopyFrom}
          replaceCurrent={replaceCurrent}
          setNotice={setNotice}
        />
      )}

      <div className="flex items-center gap-1" role="group" aria-label="History">
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          className="p-2 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-35"
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
          className="p-2 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-35"
        >
          <Icon name="redo" />
        </button>
      </div>

      <span role="status" className="flex-1 min-w-0 truncate text-xs text-green-300 px-2">
        {notice}
      </span>

      <span className="text-xs text-gray-500 hidden md:inline">
        {dirty ? (
          <span className="text-yellow-500">
            Unsaved:{' '}
            {[
              changedLayout && 'layout',
              changedGlobal && 'look',
              ...changedPacks.map(id => packs.find(p => p.id === id)?.name ?? id),
              ...changedScenes.map(x => `scene ${x.name}`),
            ]
              .filter(Boolean)
              .join(', ')}
          </span>
        ) : (
          'Saved.'
        )}
      </span>

      <button
        type="button"
        disabled={refreshing}
        onClick={() =>
          startRefresh(async () => {
            const r = await refreshOverlayAction();
            setNotice(r.message);
          })
        }
        title="Ask every open overlay (OBS) to reload the saved look"
        className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-700 text-gray-200 hover:border-gray-500 disabled:opacity-50"
      >
        <Icon name="refresh" className={`mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
        Refresh overlay
      </button>

      <ReviewMenu diffs={diffs} dirty={dirty} />

      <form action={saveAction} className="flex items-center gap-2">
        <input type="hidden" name="payload" value={payload} />
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="note" value={note} />
        <input type="hidden" name="autoReload" value={autoReload ? 'on' : ''} />
        <button
          type="button"
          disabled={!dirty}
          onClick={revert}
          className={`${btn} text-gray-400 hover:text-white disabled:opacity-40`}
        >
          Revert
        </button>
        <PendingButton
          type="submit"
          disabled={!dirty}
          className={`${btn} bg-yellow-500 text-gray-950 hover:bg-yellow-400 disabled:opacity-40`}
        >
          Save
        </PendingButton>
      </form>
      <SaveOptionsMenu note={note} setNote={setNote} autoReload={autoReload} setAutoReload={setAutoReload} />
    </div>
  );
}

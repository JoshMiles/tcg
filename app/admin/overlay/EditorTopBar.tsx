'use client';

import { Icon } from '@/app/components/Icon';
import { useEffect, useRef } from 'react';
import { PendingButton } from '../components/PendingButton';
import { Menu, MenuBar, MenuItem, MenuSeparator } from '../components/workspace/MenuBar';
import { btn } from './editor-controls';
import {
  ImportExportMenu,
  PackToolsMenu,
  GuidesMenu,
  PresetsMenu,
  ReviewMenu,
  ConflictBanner,
  DraftBanner,
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
    knownVersion,
    conflict,
    versionDiffs,
    overwrite,
    loadTheirs,
    draftOffer,
    restoreDraft,
    discardDraft,
    reviewSignal,
    showSaved,
    setShowSaved,
    showThirds,
    setShowThirds,
    showGrid,
    setShowGrid,
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
    showHint,
    activeTool,
    fit,
    zoomFit,
    zoomActual,
    setFocusMode,
    setShortcutsOpen,
    saveSignal,
  } = useOverlayEditor();
  const saveForm = useRef<HTMLFormElement>(null);
  // Ctrl+S (anywhere in the editor) bumps saveSignal; save then, if there is anything to save.
  useEffect(() => {
    if (saveSignal && dirty) saveForm.current?.requestSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSignal]);
  const handTool = activeTool !== 'move';

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-gray-900/80 border border-gray-800 px-3 py-1.5">
      <MenuBar
        end={
          <>
            <span role="status" className="min-w-0 max-w-md truncate text-xs text-green-300 px-2">
              {notice}
            </span>
            <ReviewMenu diffs={diffs} dirty={dirty} openSignal={reviewSignal} />
            <form ref={saveForm} action={saveAction} className="flex items-center gap-2">
              <input type="hidden" name="payload" value={payload} />
              <input type="hidden" name="scope" value={scope} />
              <input type="hidden" name="note" value={note} />
              <input type="hidden" name="expectedVersion" value={knownVersion} />
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
          </>
        }
      >
        <Menu label="File">
          <MenuItem label="Save" icon="check" shortcut="Ctrl+S" disabled={!dirty} onSelect={() => saveForm.current?.requestSubmit()} />
          <MenuItem label="Revert" icon="undo" disabled={!dirty} onSelect={revert} />
          <MenuSeparator />
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
          <SaveOptionsMenu note={note} setNote={setNote} autoReload={autoReload} setAutoReload={setAutoReload} />
        </Menu>
        <Menu label="Edit">
          <MenuItem label="Undo" icon="undo" shortcut="Ctrl+Z" disabled={!canUndo} onSelect={undo} />
          <MenuItem label="Redo" icon="redo" shortcut="Ctrl+Shift+Z" disabled={!canRedo} onSelect={redo} />
          {isPack && (
            <>
              <MenuSeparator />
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
            </>
          )}
        </Menu>
        <Menu label="View">
          <MenuItem label="Fit to the space" icon="search" shortcut="Ctrl+0" onSelect={zoomFit} />
          <MenuItem label="100%" icon="search" shortcut="Ctrl+1" onSelect={zoomActual} />
          <MenuItem label="Canvas only" icon="eye" shortcut="Tab" onSelect={() => setFocusMode(true)} />
          <MenuItem label="Before / after" icon="eye" checked={showSaved} disabled={!dirty} onSelect={() => setShowSaved(v => !v)} />
          <GuidesMenu
            showThirds={showThirds}
            setShowThirds={setShowThirds}
            showGrid={showGrid}
            setShowGrid={setShowGrid}
            showSafe={showSafe}
            setShowSafe={setShowSafe}
            snapOn={snapOn}
            setSnapOn={setSnapOn}
            zoom={zoom}
            setZoom={setZoom}
            bg={bg}
            setBg={setBg}
            bgImage={bgImage}
            setBgImage={setBgImage}
          />
        </Menu>
        <Menu label="Scene">
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
        </Menu>
        <Menu label="Help">
          <MenuItem label="Keyboard shortcuts" icon="keyboard" shortcut="?" onSelect={() => setShortcutsOpen(true)} />
          <MenuItem label="Show the editing hint again" icon="help" onSelect={showHint} />
        </Menu>
      </MenuBar>

      <div className="flex flex-wrap items-center gap-2">
        {handTool ? (
          <>
            <button type="button" onClick={zoomFit} className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-700 text-gray-200 hover:border-gray-500">Fit</button>
            <button type="button" onClick={zoomActual} className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-700 text-gray-200 hover:border-gray-500">100%</button>
            <span className="text-sm text-gray-300">{Math.round(fit * 100)}%</span>
          </>
        ) : (
          <>
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

          </>
        )}
        {conflict && <ConflictBanner version={conflict} diffs={versionDiffs(conflict)} overwrite={overwrite} loadTheirs={loadTheirs} />}
        {draftOffer && <DraftBanner at={draftOffer.at} stale={draftOffer.stale} restore={restoreDraft} discard={discardDraft} />}
      </div>
    </div>
  );
}

'use client';

import { Icon, type IconName } from '@/app/components/Icon';
import { useEffect, useRef } from 'react';
import { PendingButton } from '../components/PendingButton';
import { Menu, MenuBar, MenuItem, MenuSeparator, SubMenu } from '../components/workspace/MenuBar';
import { resetColumnLayout } from '../components/workspace/useColumnLayout';
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
import { EditorTextOptions } from './EditorTextOptions';
import { useOverlayEditor } from './OverlayEditorContext';
import { MAX_ZONES, type AlignMode } from '@/lib/overlay-layout';

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
    scheduledLooks,
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
    showRulers,
    toggleRulers,
    guides,
    setGuides,
    zones,
    setZones,
    layout,
    guidesLocked,
    setGuidesLocked,
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
    selection,
    locked,
    alignSelection,
    distributeSelection,
    toggleLock,
    resetSelection,
  } = useOverlayEditor();
  const saveForm = useRef<HTMLFormElement>(null);
  // Ctrl+S (anywhere in the editor) bumps saveSignal; save then, if there is anything to save.
  useEffect(() => {
    if (saveSignal && dirty) saveForm.current?.requestSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSignal]);
  // Ctrl+V an image anywhere outside a text field sets it as the background (here, not in
  // GuidesMenu, because the menu is only mounted while open).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const f = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'))?.getAsFile();
      if (!f) return;
      e.preventDefault();
      if (bgImage) URL.revokeObjectURL(bgImage);
      setBgImage(URL.createObjectURL(f));
      setBg('image');
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [bgImage, setBgImage, setBg]);
  const handTool = activeTool === 'hand' || activeTool === 'zoom';
  const free = selection.filter(id => !locked.includes(id));
  const canAlign = !isPack && free.length > 0;
  const canDistribute = !isPack && free.length > 2;
  const allLocked = selection.length > 0 && selection.every(id => locked.includes(id));
  const ALIGNS: { mode: AlignMode; label: string; icon: IconName }[] = [
    { mode: 'left', label: 'Align left', icon: 'alignLeft' }, { mode: 'center', label: 'Align centre', icon: 'alignCenter' }, { mode: 'right', label: 'Align right', icon: 'alignRight' },
    { mode: 'top', label: 'Align top', icon: 'alignTop' }, { mode: 'middle', label: 'Align middle', icon: 'alignMiddle' }, { mode: 'bottom', label: 'Align bottom', icon: 'alignBottom' },
  ];
  const DISTRIBUTES: { axis: 'x' | 'y'; label: string; icon: IconName }[] = [
    { axis: 'x', label: 'Distribute horizontally', icon: 'distributeH' }, { axis: 'y', label: 'Distribute vertically', icon: 'distributeV' },
  ];
  const alignTip = (label: string, ok: boolean, need: string) => (ok ? label : `${label} (${need})`);

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
            scheduledLooks={scheduledLooks}
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
        <Menu label="Layer">
          <SubMenu label="Align" icon="alignLeft" disabled={!canAlign}>
            <div className="whitespace-nowrap">{ALIGNS.map(a => <MenuItem key={a.mode} label={a.label} icon={a.icon} onSelect={() => alignSelection(a.mode)} />)}</div>
          </SubMenu>
          <SubMenu label="Distribute" icon="distributeH" disabled={!canDistribute}>
            <div className="whitespace-nowrap">{DISTRIBUTES.map(d => <MenuItem key={d.axis} label={d.label} icon={d.icon} onSelect={() => distributeSelection(d.axis)} />)}</div>
          </SubMenu>
          <MenuSeparator />
          <MenuItem label={allLocked ? 'Unlock' : 'Lock'} icon={allLocked ? 'unlock' : 'lock'} disabled={!selection.length} onSelect={() => toggleLock(selection)} />
          <MenuItem label="Reset position" icon="undo" disabled={!selection.length || isPack} onSelect={resetSelection} />
        </Menu>
        <Menu label="View">
          <MenuItem label="Fit to the space" icon="search" shortcut="Ctrl+0" onSelect={zoomFit} />
          <MenuItem label="100%" icon="search" shortcut="Ctrl+1" onSelect={zoomActual} />
          <MenuItem label="Canvas only" icon="eye" shortcut="Tab" onSelect={() => setFocusMode(true)} />
          <MenuItem label="Before / after" icon="eye" checked={showSaved} disabled={!dirty} onSelect={() => setShowSaved(v => !v)} />
          <MenuItem label="Rulers" icon="ruler" shortcut="Ctrl+R" checked={showRulers} onSelect={toggleRulers} />
          <MenuItem label="Lock guides" icon="lock" checked={guidesLocked} onSelect={() => setGuidesLocked(v => !v)} />
          <MenuItem label="Clear guides" icon="x" disabled={guides.x.length + guides.y.length === 0} onSelect={() => setGuides({ x: [], y: [] })} />
          <MenuItem
            label="Add Twitch zone"
            icon="plus"
            disabled={isPack || zones.length >= MAX_ZONES}
            onSelect={() => setZones(z => [...z, { id: Math.random().toString(36).slice(2, 8), name: 'Webcam', x: Math.round(layout.width * 0.7), y: Math.round(layout.height * 0.6), w: Math.round(layout.width * 0.25), h: Math.round(layout.height * 0.35) }])}
          />
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
        <Menu label="Window">
          <MenuItem label="Reset workspace" icon="undo" onSelect={resetColumnLayout} />
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
          <EditorTextOptions />
          {canAlign && (
            <div className="flex items-center gap-0.5" role="group" aria-label="Align and distribute">
              {ALIGNS.map(a => (
                <button key={a.mode} type="button" onClick={() => alignSelection(a.mode)} title={alignTip(a.label, true, '')} aria-label={a.label} className="p-1.5 rounded-md text-gray-200 hover:bg-white/10">
                  <Icon name={a.icon} />
                </button>
              ))}
              <span className="mx-1 h-4 border-l border-gray-700" />
              {DISTRIBUTES.map(d => (
                <button key={d.axis} type="button" disabled={!canDistribute} onClick={() => distributeSelection(d.axis)} title={alignTip(d.label, canDistribute, 'select 3 or more unlocked parts')} aria-label={d.label} className="p-1.5 rounded-md text-gray-200 hover:bg-white/10 disabled:opacity-40">
                  <Icon name={d.icon} />
                </button>
              ))}
            </div>
          )}
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

'use client';

import { OverlayEditorProvider, useOverlayEditor, type OverlayEditorProps } from './OverlayEditorContext';
import { EditorScopeTabs } from './EditorScopeTabs';
import { EditorStatusBar } from './EditorStatusBar';
import { EditorToolStrip } from './EditorToolStrip';
import { EditorTopBar } from './EditorTopBar';
import { PreviewStage } from './PreviewStage';
import { ArtboardStrip } from './ArtboardStrip';
import { EditorTimeline } from './EditorTimeline';
import { PropertiesDock } from './PropertiesDock';
import { useColumnLayout } from '../components/workspace/useColumnLayout';
import { ShortcutsSheet } from './ShortcutsSheet';

// The Overlay Editor: one Photoshop-style workspace for where the overlay sits (Layout) and how it looks and moves.
// Everything is generated from the registry in lib/overlay-props.ts.
// Layout: a menu bar (File, Edit, View, Scene, Help; Revert / Save at its right) and an options bar over a tool strip and a fixed
// canvas (the real overlay in an iframe), a docked properties panel (document / layer settings, search) and a status bar below.
// Tab hides everything but the canvas (hidden, not unmounted: the top bar owns the save form).
function Workspace() {
  const { focusMode } = useOverlayEditor();
  const hide = focusMode ? 'hidden' : '';
  const column = useColumnLayout('tcg:overlay-workspace', ['history']);
  return (
    <div data-workspace className="flex flex-col gap-3 xl:h-full min-h-0">
      <div className={hide}>
        <EditorTopBar />
      </div>
      <div style={{ '--dock-w': column.railed ? '2.75rem' : `${column.width}rem` } as React.CSSProperties} className={`flex-1 min-h-0 grid gap-3 ${focusMode ? '' : 'xl:grid-cols-[minmax(0,1fr)_var(--dock-w)]'}`}>
        <div className="min-h-0 min-w-0 flex flex-col gap-2">
          <div className={hide}>
            <EditorScopeTabs />
          </div>
          <div className="flex-1 min-h-64 h-[55vh] xl:h-auto flex gap-2">
            <EditorToolStrip />
            <PreviewStage />
          </div>
          <div className={hide}>
            <ArtboardStrip />
          </div>
          <div className={hide}>
            <EditorTimeline />
          </div>
        </div>
        <div className={focusMode ? 'hidden' : 'contents'}>
          <PropertiesDock column={column} />
        </div>
      </div>
      <div className={hide}>
        <EditorStatusBar />
      </div>
      <ShortcutsSheet />
    </div>
  );
}

export function OverlayEditor(props: OverlayEditorProps) {
  return (
    <OverlayEditorProvider {...props}>
      <Workspace />
    </OverlayEditorProvider>
  );
}
export type { OverlayEditorProps };

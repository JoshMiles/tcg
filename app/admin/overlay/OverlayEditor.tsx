'use client';

import { OverlayEditorProvider, type OverlayEditorProps } from './OverlayEditorContext';
import { EditorTopBar } from './EditorTopBar';
import { PreviewStage } from './PreviewStage';
import { PreviewToolbar } from './PreviewToolbar';
import { PropertiesDock } from './PropertiesDock';

// The Overlay Editor: one Photoshop-style workspace for where the overlay sits (Layout) and how it looks and moves.
// Everything is generated from the registry in lib/overlay-props.ts.
// Layout: an options bar (scope, presets, import/export, save) over a fixed canvas (the real overlay in an iframe)
// and a docked properties panel (category rail, version tabs, collapsible sections, search).
export function OverlayEditor(props: OverlayEditorProps) {
  return (
    <OverlayEditorProvider {...props}>
      <div data-workspace className="flex flex-col gap-3 xl:h-full min-h-0">
        <EditorTopBar />
        <div className="flex-1 min-h-0 grid gap-3 xl:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="min-h-0 min-w-0 flex flex-col gap-2">
            <PreviewStage />
            <PreviewToolbar />
          </div>
          <PropertiesDock />
        </div>
      </div>
    </OverlayEditorProvider>
  );
}
export type { OverlayEditorProps };

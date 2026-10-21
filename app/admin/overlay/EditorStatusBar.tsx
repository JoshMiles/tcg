'use client';

import { VARIANT_IDS } from '@/lib/overlay-props';
import { PERF_LABEL, variantPerf } from '@/lib/overlay-perf';
import { StatusBar, StatusItem } from '../components/workspace/StatusBar';
import { PERF_STYLE, VARIANT_LABELS } from './editor-types';
import { useOverlayEditor } from './OverlayEditorContext';

// The strip under the Overlay Editor: what the canvas shows, how heavy the look is, what is unsaved and when it was last saved.
export function EditorStatusBar() {
  const { fit, shownLayout, valueOf, dirty, diffs, openReview, lastSavedAt, conflict, packs, changedLayout, changedGlobal, changedPacks, changedScenes } = useOverlayEditor();
  const worst = VARIANT_IDS.map(v => ({ v, r: variantPerf(valueOf, v) })).sort((a, b) => b.r.score - a.r.score)[0];
  const unsaved = [
    changedLayout && 'layout',
    changedGlobal && 'look',
    ...changedPacks.map(id => packs.find(p => p.id === id)?.name ?? id),
    ...changedScenes.map(x => `scene ${x.name}`),
  ].filter(Boolean).join(', ');
  return (
    <StatusBar>
      <StatusItem title="The canvas scale (Fit, 150%, ... is set under View > Guides, zoom and background)">Zoom {Math.round(fit * 100)}%</StatusItem>
      <StatusItem title="The stage size, in design pixels">{shownLayout.width} × {shownLayout.height}</StatusItem>
      <span
        title={`${VARIANT_LABELS[worst.v]} is the heaviest version${worst.r.reasons.length ? ': ' + worst.r.reasons.join(', ') : ''}. A rough guide to how hard the overlay works in OBS.`}
        className={`text-[11px] font-bold rounded-full border px-2 py-0.5 ${PERF_STYLE[worst.r.level]}`}
      >
        Load: {PERF_LABEL[worst.r.level]}
      </span>
      {dirty ? (
        <StatusItem tone="warn" onClick={openReview} title={`Review: ${unsaved}`}>{diffs.length} unsaved</StatusItem>
      ) : (
        <StatusItem>Saved</StatusItem>
      )}
      <StatusItem>{lastSavedAt ? `Last saved ${new Date(lastSavedAt).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC` : 'Not saved yet'}</StatusItem>
      {conflict && <StatusItem tone="bad" title="Someone saved a newer version; see the banner above the canvas">Save conflict</StatusItem>}
    </StatusBar>
  );
}

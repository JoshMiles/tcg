'use client';

import { useEffect, useRef, useState } from 'react';
import { mergePropValues } from '@/lib/overlay-props';
import type { OverlayLayout } from '@/lib/overlay-layout';
import type { PropValues } from '@/lib/overlay-props';
import { useOverlayEditor } from './OverlayEditorContext';

const BOX_W = 220;
const BOX_H = 130;
const MAX_BOARDS = 8; // every board is a live iframe

// One non-selected scope as a small still of the overlay at its own stage size, fed the editor's current values for it.
function Board({ name, layout, props, onPick }: { name: string; layout: OverlayLayout; props: PropValues; onPick: () => void }) {
  const { mode, version, pickPack, pickCard } = useOverlayEditor();
  const ref = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const scale = Math.min(BOX_W / layout.width, BOX_H / layout.height);
  const variant = version === 'regular' ? '' : version;
  useEffect(() => {
    if (!loaded) return;
    const post = (m: object) => ref.current?.contentWindow?.postMessage(m, window.location.origin);
    post({ type: 'layout', layout });
    post({ type: 'variant', variant });
    post({ type: 'props', props, packId: pickPack, cardNumber: pickCard });
    post({ type: 'static', mode, showoff: false });
  }, [loaded, layout, variant, props, pickPack, pickCard, mode]);
  return (
    <button type="button" onClick={onPick} title={`Edit ${name}`} className="shrink-0 rounded-md border border-gray-700 hover:border-yellow-500 bg-gray-950/70 p-1.5 text-left">
      <div className="relative overflow-hidden rounded-sm" style={{ width: layout.width * scale, height: layout.height * scale, backgroundColor: '#1a1d23' }}>
        <iframe
          ref={ref}
          src="/overlay.html?preview&editor"
          title={`${name} preview`}
          tabIndex={-1}
          onLoad={() => setLoaded(true)}
          className="pointer-events-none"
          style={{ width: layout.width, height: layout.height, border: 0, background: 'transparent', colorScheme: 'light', transform: `scale(${scale})`, transformOrigin: 'top left' }}
        />
      </div>
      <p className="mt-1 text-[11px] font-bold text-gray-200 truncate" style={{ maxWidth: BOX_W }}>{name}</p>
      <p className="text-[10px] text-gray-500">{layout.width} x {layout.height}</p>
    </button>
  );
}

// View > Artboards: the global layout and each scene side by side. The current scope is the normal stage above, so it is left out here.
export function ArtboardStrip() {
  const { showArtboards, scope, setScope, presets, layoutOf, globalVals, packVals } = useOverlayEditor();
  if (!showArtboards) return null;
  const boards = [
    { key: 'global', name: 'Global', props: globalVals },
    ...presets.map(x => ({ key: 'scene:' + x.id, name: x.name, props: mergePropValues(globalVals, packVals['scene:' + x.id]) })),
  ].filter(b => b.key !== scope);
  return (
    <div className="flex flex-wrap gap-2 max-h-48 overflow-auto rounded-xl border border-gray-800 bg-gray-950/70 p-2">
      {boards.slice(0, MAX_BOARDS).map(b => (
        <Board key={b.key} name={b.name} layout={layoutOf(b.key)} props={b.props} onPick={() => setScope(b.key)} />
      ))}
      {boards.length > MAX_BOARDS && <p className="self-center text-[11px] text-gray-500">Showing {MAX_BOARDS} of {boards.length} boards.</p>}
    </div>
  );
}

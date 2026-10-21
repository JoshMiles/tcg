'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { LayerMenu } from './LayerMenu';
import { useOverlayEditor } from './OverlayEditorContext';

export function PreviewStage() {
  const {
    boxRef,
    frameRef,
    frameW,
    frameH,
    bg,
    bgImage,
    dragging,
    onKeyDown,
    shownLayout,
    fit,
    setReady,
    setLoadedCount,
    showGrid,
    showThirds,
    showSafe,
    showSaved,
    ready,
    isPack,
    hintSignal,
  } = useOverlayEditor();
  // First-use hint: gone for good once dismissed (localStorage may be blocked, then it just shows again next time).
  const HINT_KEY = 'tcg:overlay-editor-hint';
  const [hintGone, setHintGone] = useState(true);
  useEffect(() => {
    try { setHintGone(localStorage.getItem(HINT_KEY) === '1'); } catch { setHintGone(false); }
  }, []);
  // Help > Show the editing hint again.
  useEffect(() => {
    if (!hintSignal) return;
    setHintGone(false);
    try { localStorage.removeItem(HINT_KEY); } catch { /* ignore */ }
  }, [hintSignal]);
  const dismissHint = () => {
    setHintGone(true);
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* ignore */ }
  };

  return (
    <div
      ref={boxRef}
      className="relative flex-1 min-h-64 h-[55vh] xl:h-auto rounded-xl border border-gray-800 bg-gray-950/70 overflow-auto flex"
    >
      <div
        className="relative overflow-hidden rounded-md border border-gray-700 shrink-0 m-auto outline-hidden focus-visible:border-yellow-500"
        tabIndex={0}
        onKeyDown={onKeyDown}
        style={{
          width: frameW,
          height: frameH,
          ...(bg === 'image' && bgImage
            ? { backgroundColor: '#000', backgroundImage: `url(${bgImage})`, backgroundSize: '100% 100%' }
            : bg === 'dark'
              ? { backgroundColor: '#07080b' }
              : bg === 'light'
                ? { backgroundColor: '#e5e7eb' }
                : bg === 'green'
                  ? { backgroundColor: '#00b140' }
                  : {
                      backgroundColor: '#1a1d23',
                      backgroundImage:
                        'conic-gradient(#262a32 25%, transparent 0 50%, #262a32 0 75%, transparent 0)',
                      backgroundSize: '24px 24px',
                    }),
        }}
      >
        <iframe
          ref={frameRef}
          src="/overlay.html?preview"
          title="Overlay preview"
          onLoad={() => {
            setReady(true);
            setLoadedCount(c => c + 1);
          }}
          style={{
            width: shownLayout.width,
            height: shownLayout.height,
            border: 0,
            background: 'transparent',
            colorScheme: 'light',
            transform: `scale(${fit})`,
            transformOrigin: 'top left',
          }}
        />
        {/* Guides (never part of the overlay, only drawn over the preview) */}
        {showGrid && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.10) 1px, transparent 1px)',
              backgroundSize: '10% 10%',
            }}
          />
        )}
        {showThirds && (
          <>
            <div aria-hidden className="absolute inset-y-0 left-1/3 w-px bg-sky-400/40 pointer-events-none" />
            <div aria-hidden className="absolute inset-y-0 left-2/3 w-px bg-sky-400/40 pointer-events-none" />
            <div aria-hidden className="absolute inset-x-0 top-1/3 h-px bg-sky-400/40 pointer-events-none" />
            <div aria-hidden className="absolute inset-x-0 top-2/3 h-px bg-sky-400/40 pointer-events-none" />
          </>
        )}
        {showSafe && (
          <>
            <div aria-hidden className="absolute inset-[5%] border border-dashed border-amber-300/50 pointer-events-none">
              <span className="absolute top-0 left-1 text-[9px] text-amber-300/70">action safe</span>
            </div>
            <div aria-hidden className="absolute inset-[10%] border border-dashed border-rose-300/50 pointer-events-none">
              <span className="absolute top-0 left-1 text-[9px] text-rose-300/70">title safe</span>
            </div>
          </>
        )}
        {showSaved && (
          <span className="absolute top-2 left-2 rounded-md bg-gray-950/85 border border-yellow-500/50 px-2 py-0.5 text-[11px] font-bold text-yellow-300 pointer-events-none">
            Showing the saved look
          </span>
        )}
        {dragging && (
          <>
            {/* Centre guides: the middle of the browser source */}
            <div className="absolute inset-y-0 left-1/2 w-px bg-yellow-400/25 pointer-events-none" />
            <div className="absolute inset-x-0 top-1/2 h-px bg-yellow-400/25 pointer-events-none" />
          </>
        )}
        {!hintGone && !isPack && ready && (
          <p className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-md bg-gray-950/90 border border-gray-700 px-2.5 py-1 text-[11px] text-gray-300">
            Click anything to edit it, drag to move it
            <button type="button" onClick={dismissHint} aria-label="Dismiss hint" className="text-gray-500 hover:text-white">
              <Icon name="x" />
            </button>
          </p>
        )}
        {!ready && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">Loading preview…</p>
        )}
      </div>
      <LayerMenu />
    </div>
  );
}

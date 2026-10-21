'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { Segmented, btn } from './editor-controls';
import { VARIANT_IDS, type VariantId } from '@/lib/overlay-props';
import { MOMENT_IDS } from '@/lib/overlay-moments';
import { VARIANT_LABELS, type MomentPick } from './editor-types';
import { useOverlayEditor } from './OverlayEditorContext';

const KEY = 'tcg:overlay-timeline';

// The area under the canvas: the preview controls in its header row, the reveal scrubber below (collapsible to the header alone).
export function EditorTimeline() {
  const {
    showOff,
    setShowOff,
    mode,
    setMode,
    category,
    setCategory,
    openCat,
    setOpenCat,
    selected,
    isPack,
    version,
    setVersion,
    moment,
    setMoment,
    packs,
    pickPack,
    setPickPack,
    pickCard,
    setPickCard,
    previewCards,
    previewCard,
    play,
    ready,
    playing,
    rehearsing,
    rehearse,
    stopRehearsal,
    timeline,
    timelineCmd,
  } = useOverlayEditor();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(KEY) === 'collapsed'); } catch { /* storage blocked */ }
  }, []);
  const toggle = () => setCollapsed(c => {
    try { localStorage.setItem(KEY, c ? 'open' : 'collapsed'); } catch { /* storage blocked */ }
    return !c;
  });

  const canScrub = !!timeline && mode === 'pack' && !rehearsing;
  const dur = timeline?.dur ?? 0;
  const t = Math.min(dur, timeline?.t ?? 0);
  const MARKERS: [string, string][] = [['pack', 'Pack'], ['reveal', 'Card'], ['info', 'Text'], ['label', 'Label']];

  return (
    <div className="rounded-xl bg-gray-900/80 border border-gray-800 px-3 py-2">
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label="View"
        value={showOff && mode === 'pack' ? 'showoff' : mode}
        onChange={v => {
          setShowOff(v === 'showoff');
          setMode(v === 'collection' ? 'collection' : 'pack');
          // The dock follows the view: the same category the rail used to highlight, opened on the Document page.
          const next = v === 'showoff' ? 'showoff' : !isPack && category !== 'layout' ? (v === 'collection' ? 'collection' : category === 'collection' || category === 'showoff' ? 'pack' : category) : null;
          if (next) {
            setCategory(next);
            if (!selected && (v === 'showoff' || openCat)) setOpenCat(next);
          }
        }}
        options={[
          { id: 'pack', label: 'Pack opening' },
          { id: 'showoff', label: 'Show off' },
          { id: 'collection', label: 'Collection' },
        ]}
        disabled={isPack ? ['collection'] : []}
      />
      {mode === 'pack' && (
        <Segmented
          label="Preview as"
          value={version}
          onChange={v => setVersion(v as VariantId)}
          options={VARIANT_IDS.map(v => ({ id: v, label: VARIANT_LABELS[v] }))}
        />
      )}
      {mode === 'pack' && !showOff && (
        <Segmented
          label="Moment"
          value={moment}
          onChange={v => setMoment(v as MomentPick)}
          options={[
            { id: '', label: 'None' },
            ...MOMENT_IDS.map(m => ({
              id: m,
              label: m === 'firstEver' ? 'First-ever' : m === 'firstPull' ? 'First pull' : 'New card',
            })),
          ]}
        />
      )}
      {mode === 'pack' && (
        <div className="flex items-center gap-1.5">
          {!isPack && packs.length > 1 && (
            <select
              value={pickPack}
              onChange={e => {
                setPickPack(e.target.value);
                setPickCard(0);
              }}
              aria-label="Preview pack"
              className="select select-sm max-w-36"
            >
              <option value="">First pack</option>
              {packs.map(x => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          )}
          {previewCards.length > 0 && (
            <select
              value={previewCard}
              onChange={e => setPickCard(Number(e.target.value))}
              aria-label="Preview card"
              className="select select-sm max-w-40"
            >
              <option value={0}>Rarest card</option>
              {previewCards.map(c => (
                <option key={c.number} value={c.number}>
                  #{c.number} {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={play}
        disabled={!ready || playing || rehearsing}
        className={`${btn} ml-auto bg-yellow-500 text-gray-950 hover:bg-yellow-400 disabled:opacity-40`}
      >
        {playing ? '… playing' : mode === 'collection' ? 'Play collection' : showOff ? 'Play show off' : 'Play pack opening'}
      </button>
      {mode === 'pack' && (
        <button
          type="button"
          onClick={rehearsing ? stopRehearsal : rehearse}
          disabled={!ready || (playing && !rehearsing)}
          title="Play 5 pulls and a show-off back to back with the real gaps (nothing is saved or queued)"
          className={`${btn} disabled:opacity-40`}
        >
          {rehearsing ? 'Stop rehearsal' : 'Play a stream'}
        </button>
      )}
      <button type="button" onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? 'Show the timeline' : 'Hide the timeline'} title={collapsed ? 'Show the timeline' : 'Hide the timeline'} className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/10">
        <Icon name={collapsed ? 'chevronUp' : 'chevronDown'} />
      </button>
    </div>
    {!collapsed && (
      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-800">
        <button
          type="button"
          onClick={() => timelineCmd(timeline?.paused ? 'resume' : 'pause')}
          disabled={!canScrub}
          aria-label={timeline?.paused ? 'Resume' : 'Pause'}
          title={canScrub ? (timeline?.paused ? 'Resume' : 'Pause the reveal') : 'Play a pull to scrub it'}
          className="p-1.5 rounded-md border border-gray-700 text-gray-200 hover:border-gray-500 disabled:opacity-40"
        >
          <Icon name={timeline?.paused ? 'play' : 'pause'} />
        </button>
        <div className="relative flex-1 min-w-0">
          <input
            type="range"
            min={0}
            max={Math.max(dur, 0.01)}
            step={0.01}
            value={t}
            disabled={!canScrub || !timeline?.paused}
            onChange={e => timelineCmd('seek', Number(e.target.value))}
            aria-label="Reveal time"
            title={timeline?.paused ? 'Drag to scrub the reveal' : canScrub ? 'Pause to scrub' : 'Play a pull to scrub it'}
            className="w-full accent-yellow-400 disabled:opacity-50"
          />
          {canScrub && dur > 0 && timeline?.markers && (
            <div className="relative h-4 text-[10px] text-gray-500" aria-hidden>
              {MARKERS.map(([k, name]) => timeline.markers && timeline.markers[k] !== undefined && (
                <span key={k} className="absolute -translate-x-1/2" style={{ left: `${Math.min(100, (timeline.markers[k] / dur) * 100)}%` }}>| {name}</span>
              ))}
            </div>
          )}
        </div>
        <span className="text-xs text-gray-300 tabular-nums w-24 text-right">{canScrub ? `${t.toFixed(2)} / ${dur.toFixed(2)} s` : '- / - s'}</span>
      </div>
    )}
    </div>
  );
}

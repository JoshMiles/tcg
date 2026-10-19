'use client';

import { Icon } from '@/app/components/Icon';
import { Segmented, btn } from './editor-controls';
import { GuidesMenu } from './EditorMenus';
import { VARIANT_IDS, type VariantId } from '@/lib/overlay-props';
import { MOMENT_IDS } from '@/lib/overlay-moments';
import { PERF_LABEL, variantPerf } from '@/lib/overlay-perf';
import { PERF_STYLE, VARIANT_LABELS, type MomentPick } from './editor-types';
import { useOverlayEditor } from './OverlayEditorContext';

export function PreviewToolbar() {
  const {
    showOff,
    setShowOff,
    mode,
    setMode,
    category,
    setCategory,
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
    showSaved,
    setShowSaved,
    dirty,
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
    valueOf,
    play,
    ready,
    playing,
  } = useOverlayEditor();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-900/80 border border-gray-800 px-3 py-2">
      <Segmented
        label="View"
        value={showOff && mode === 'pack' ? 'showoff' : mode}
        onChange={v => {
          setShowOff(v === 'showoff');
          setMode(v === 'collection' ? 'collection' : 'pack');
          if (v === 'showoff') setCategory('showoff');
          else if (!isPack && category !== 'layout') {
            setCategory(v === 'collection' ? 'collection' : category === 'collection' || category === 'showoff' ? 'pack' : category);
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
        onClick={() => setShowSaved(v => !v)}
        disabled={!dirty}
        aria-pressed={showSaved}
        title="Flip the preview between your edit and what is saved"
        className={`px-2.5 py-1 rounded-md text-xs font-semibold border disabled:opacity-35 ${
          showSaved
            ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300'
            : 'border-gray-700 text-gray-400 hover:border-gray-500'
        }`}
      >
        <Icon name="eye" className="mr-1" />
        Before / after
      </button>
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
      {(() => {
        const worst = VARIANT_IDS.map(v => ({ v, r: variantPerf(valueOf, v) })).sort((a, b) => b.r.score - a.r.score)[0];
        return (
          <span
            title={`${VARIANT_LABELS[worst.v]} is the heaviest version${worst.r.reasons.length ? ': ' + worst.r.reasons.join(', ') : ''}. A rough guide to how hard the overlay works in OBS.`}
            className={`text-[11px] font-bold rounded-full border px-2 py-0.5 ${PERF_STYLE[worst.r.level]}`}
          >
            Load: {PERF_LABEL[worst.r.level]}
          </span>
        );
      })()}
      <button
        type="button"
        onClick={play}
        disabled={!ready || playing}
        className={`${btn} ml-auto bg-yellow-500 text-gray-950 hover:bg-yellow-400 disabled:opacity-40`}
      >
        {playing ? '… playing' : mode === 'collection' ? 'Play collection' : showOff ? 'Play show off' : 'Play pack opening'}
      </button>
    </div>
  );
}

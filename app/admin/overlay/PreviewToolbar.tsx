'use client';

import { Segmented, btn } from './editor-controls';
import { VARIANT_IDS, type VariantId } from '@/lib/overlay-props';
import { MOMENT_IDS } from '@/lib/overlay-moments';
import { VARIANT_LABELS, type MomentPick } from './editor-types';
import { useOverlayEditor } from './OverlayEditorContext';

export function PreviewToolbar() {
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
  } = useOverlayEditor();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-900/80 border border-gray-800 px-3 py-2">
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
        disabled={!ready || playing}
        className={`${btn} ml-auto bg-yellow-500 text-gray-950 hover:bg-yellow-400 disabled:opacity-40`}
      >
        {playing ? '… playing' : mode === 'collection' ? 'Play collection' : showOff ? 'Play show off' : 'Play pack opening'}
      </button>
    </div>
  );
}

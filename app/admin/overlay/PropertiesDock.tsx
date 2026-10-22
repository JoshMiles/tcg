'use client';

import { useEffect } from 'react';
import { Icon } from '@/app/components/Icon';
import { ColumnResizer } from '../components/workspace/ColumnResizer';
import { PanelStack, type PanelDef } from '../components/workspace/PanelStack';
import type { useColumnLayout } from '../components/workspace/useColumnLayout';
import { LAYER_NAMES, LayersPanel } from './LayersPanel';
import { CustomLayerPanel } from './CustomLayerPanel';
import { useTextBar } from './EditorTextOptions';
import { HistoryPanel } from './HistoryPanel';
import { NavigatorPanel } from './NavigatorPanel';
import { LayerBlock } from './LayerBlock';
import { LayoutPanel } from './LayoutPanel';
import { VariantPicker } from './VariantPicker';
import { PropRow, ghost } from './editor-controls';
import { PROPS, PROP_GROUPS, VARIANT_IDS, type PropDef, type VariantId } from '@/lib/overlay-props';
import { PERF_LABEL, variantPerf } from '@/lib/overlay-perf';
import { PERF_STYLE, VARIANT_LABELS, dependsOn } from './editor-types';
import { sectionForTarget, useOverlayEditor } from './OverlayEditorContext';

export function PropertiesDock({ column }: { column: ReturnType<typeof useColumnLayout> }) {
  const {
    isPack,
    zoom,
    isOver,
    isScene,
    scene,
    setCategory,
    openCat,
    setOpenCat,
    selected,
    selection,
    locked,
    toggleSelect,
    toggleLock,
    resetSelection,
    linkSelection,
    unlinkSelection,
    modifiedCount,
    searching,
    setQuery,
    setMode,
    setShowOff,
    setVariantOpen,
    variantOpen,
    version,
    setVersion,
    copyVariant,
    query,
    openMap,
    setOpenMap,
    setSelected,
    defsFor,
    groupSections,
    hiddenInScope,
    matches,
    valueOf,
    current,
    globalVals,
    setValue,
    resetKeys,
    layout,
    overlapIds,
    lowContrast,
    layoutVals,
    mode,
    setLayoutVals,
    setPlacement,
    setNotice,
    selectTarget,
    selectView,
    hoverElement,
    openLayerMenu,
  } = useOverlayEditor();

  // Two modes: a selected layer shows just its own settings; with nothing selected the panel is the document (layout plus the category list).
  // A category opened from that list is a sub-page of the document and never selects anything on the canvas.
  useEffect(() => { if (selected) setOpenCat(null); }, [selected]);
  const target = selected ? sectionForTarget(selected) : undefined;
  const customSel = !isPack && selected.startsWith('custom:') ? (['pack', 'collection'] as const).flatMap(view => (layout[view].custom ?? []).filter(l => `custom:${l.id}` === selected).map(l => ({ view, id: l.id })))[0] : undefined;
  const multi = selection.length > 1;
  const layer = !multi && target && !(isPack && target[0] === 'collection') ? target : undefined;
  const layerName = (LAYER_NAMES as Record<string, string>)[selected] ?? selected;
  const cat = PROP_GROUPS.find(g => g.id === (layer ? layer[0] : isPack && openCat === 'collection' ? null : openCat));
  const categories = isPack ? PROP_GROUPS.filter(g => g.id !== 'collection') : PROP_GROUPS;
  // The settings the options bar's text row now carries for a selected built-in part (ROADMAP 38.31).
  const bar = useTextBar();
  const moved = bar?.kind === 'builtin' ? [bar.part.font, bar.part.size, bar.part.color] : [];
  const catDefs = cat ? defsFor(cat.id).filter(d => !moved.includes(d.key)) : [];
  const scopeKey = cat ? `${cat.id}${cat.id === 'variants' ? '.' + version : ''}` : '';
  const variantPicker = cat?.id === 'variants' && !variantOpen;
  const catSections = groupSections(catDefs);
  const goDocument = () => { setSelected(''); setOpenCat(null); setQuery(''); setShowOff(false); };
  const openCategory = (id: string) => {
    setOpenCat(id);
    setCategory(id);
    setQuery('');
    if (id === 'pack' || id === 'variants' || id === 'moments' || id === 'showoff') setMode('pack');
    setShowOff(id === 'showoff');
    if (id === 'collection') setMode('collection');
    if (id === 'variants') setVariantOpen(false);
  };

  // Search results span every category (and every version), labelled with where each one lives.
  const searchResults = searching
    ? PROP_GROUPS.flatMap(g =>
        groupSections(PROPS.filter(d => d.group === g.id && !hiddenInScope(d) && !moved.includes(d.key) && matches(d))).flatMap(
          ([name, defs]) =>
            defs.map(d => ({
              d,
              crumb: `${g.label}${d.variant ? ' › ' + VARIANT_LABELS[d.variant] : ''} › ${name}`,
            })),
        ),
      )
    : [];

  const variantPickerList = (
    <VariantPicker
      valueOf={valueOf}
      current={current}
      version={version}
      onPick={v => {
        setVersion(v);
        setVariantOpen(true);
        setMode('pack');
      }}
    />
  );

  const layoutPanel = (
    <LayoutPanel
      layout={layout}
      layoutVals={layoutVals}
      isScene={isScene}
      sceneName={scene?.name ?? ''}
      isPack={isPack}
      selected={selected}
      mode={mode}
      setMode={setMode}
      setLayoutVals={setLayoutVals}
      setPlacement={setPlacement}
      setValue={setValue}
      setNotice={setNotice}
    />
  );

  const renderRow = (def: PropDef) => {
    const dep = dependsOn(def.key);
    const off = dep ? !dep.when(valueOf(dep.key)) : false;
    return (
      <PropRow
        key={def.key}
        def={def}
        value={valueOf(def.key)}
        modified={current[def.key] !== undefined}
        inherited={isOver && current[def.key] === undefined && globalVals[def.key] !== undefined}
        isPack={isOver}
        off={off}
        onChange={v => setValue(def.key, v)}
        onReset={() => resetKeys([def.key])}
      />
    );
  };

  const renderSection = (sKey: string, name: string, defs: PropDef[], index: number) => {
    const k = `${sKey}/${name}`;
    const open = searching || (openMap[k] ?? (layer?.[1] ? name === layer[1] : index < 2));
    const changed = defs.filter(d => current[d.key] !== undefined);
    return (
      <section key={k} data-section={k} className="border-b border-gray-800/80 last:border-0">
        <div className="flex items-center gap-1 pr-2">
          <button
            type="button"
            onClick={() => setOpenMap(m => ({ ...m, [k]: !open }))}
            aria-expanded={open}
            className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left hover:bg-white/5"
          >
            <span
              aria-hidden
              className={`text-[10px] text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`}
            >
              <Icon name="chevronRight" className="w-3 h-3" />
            </span>
            <span className="text-xs font-semibold text-gray-200 truncate">{name || 'Settings'}</span>
            {changed.length > 0 && (
              <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 rounded-full px-1.5">
                {changed.length}
              </span>
            )}
          </button>
          {changed.length > 0 && (
            <button
              type="button"
              onClick={() => resetKeys(defs.map(d => d.key))}
              className="text-xs text-gray-500 hover:text-white px-1"
              title={isOver ? 'Clear the overrides in this section' : 'Reset this section to the defaults'}
            >
              {isOver ? 'inherit' : 'reset'}
            </button>
          )}
        </div>
        {open && <div className="px-2 pb-3 pt-1 space-y-3">{defs.map(renderRow)}</div>}
      </section>
    );
  };

  const backRow = (
    <div className="flex items-center gap-2 text-sm min-w-0">
      <button type="button" onClick={goDocument} className="text-gray-400 hover:text-white font-semibold shrink-0">
        ← Document
      </button>
      <span className="text-gray-600" aria-hidden>
        /
      </span>
      <span className="font-bold text-yellow-300 truncate">{layer ? layerName : cat?.label}</span>
    </div>
  );

  // Properties follows the selection; Layers sits under it and takes the rest of the column (hidden in a pack override).
  const properties = (
    <div className="min-h-0 flex-1 flex flex-col">
      <div className="p-2 space-y-2 border-b border-gray-800">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Find a setting"
          aria-label="Search settings"
          className="input input-sm w-full"
        />
        {!searching && cat && backRow}
        {!searching && cat && cat.id === 'variants' && variantOpen && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => setVariantOpen(false)}
                className="text-gray-400 hover:text-white font-semibold"
              >
                ← Variants
              </button>
              <span className="text-gray-600" aria-hidden>
                /
              </span>
              <span className="font-bold text-yellow-300">{VARIANT_LABELS[version]}</span>
            </div>
            <p className="text-xs text-gray-400 leading-snug rounded-md bg-yellow-500/10 border border-yellow-500/20 px-2 py-1.5">
              Editing the <strong className="text-yellow-300">{VARIANT_LABELS[version]}</strong> card. The preview shows it.
            </p>
            {(() => {
              const r = variantPerf(valueOf, version);
              if (r.level === 'light' && r.reasons.length === 0) return null;
              return (
                <p className={`text-xs leading-snug rounded-md border px-2 py-1.5 ${PERF_STYLE[r.level]}`}>
                  <strong>{PERF_LABEL[r.level]} on OBS.</strong>
                  {r.reasons.length > 0
                    ? ` ${r.reasons.join('; ')}. Consider turning these down if the overlay stutters.`
                    : ' A fair amount of motion; fine for most setups.'}
                </p>
              );
            })()}
            <label className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              Copy the look of
              <select
                value=""
                onChange={e => {
                  if (e.target.value) copyVariant(e.target.value as VariantId);
                }}
                className="select select-sm"
              >
                <option value="">choose a variant…</option>
                {VARIANT_IDS.filter(v => v !== version).map(v => (
                  <option key={v} value={v}>
                    {VARIANT_LABELS[v]}
                  </option>
                ))}
              </select>
              onto {VARIANT_LABELS[version]}
            </label>
          </div>
        )}
        {!searching && cat && cat.id !== 'variants' && (
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-gray-500 leading-snug min-w-0">{cat.description}</p>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setOpenMap(m => ({
                    ...m,
                    ...Object.fromEntries(catSections.map(([n]) => [`${scopeKey}/${n}`, true])),
                  }))
                }
                className="text-xs text-gray-500 hover:text-white"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={() =>
                  setOpenMap(m => ({
                    ...m,
                    ...Object.fromEntries(catSections.map(([n]) => [`${scopeKey}/${n}`, false])),
                  }))
                }
                className="text-xs text-gray-500 hover:text-white"
              >
                Collapse all
              </button>
            </div>
          </div>
        )}
        {!searching && cat && variantPicker && <p className="text-xs text-gray-500 leading-snug">{cat.description}</p>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {layer && !searching && <LayerBlock />}
        {multi && (
          <section aria-label="Selection" className="p-3 space-y-2">
            <h3 className="text-sm font-bold text-yellow-300">{selection.length} layers selected</h3>
            <p className="text-xs text-gray-500 leading-snug">Drag, arrow keys and the corner handles move or resize them together. Shift+click a part to take it out.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => toggleLock(selection)} className={ghost}>{selection.every(i => locked.includes(i)) ? 'Unlock' : 'Lock'}</button>
              <button type="button" onClick={resetSelection} className={ghost}>Reset position</button>
            </div>
          </section>
        )}
        {multi && !searching ? null : searching ? (
          searchResults.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No settings match &ldquo;{query}&rdquo;.</p>
          ) : (
            <div className="p-3 space-y-4">
              {searchResults.map(({ d, crumb }) => (
                <div key={d.key} className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-gray-600">{crumb}</p>
                  {renderRow(d)}
                </div>
              ))}
            </div>
          )
        ) : customSel ? (
          <CustomLayerPanel view={customSel.view} layerId={customSel.id} />
        ) : !cat ? (
          <>
            {!isPack && layoutPanel}
            <nav aria-label="Setting categories" className="p-3 space-y-1">
              <h3 className="px-1 text-[10px] uppercase tracking-wide text-gray-600">Settings</h3>
              {categories.map(g => {
                const n = modifiedCount(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => openCategory(g.id)}
                    title={g.description}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold text-gray-300 hover:bg-white/5 hover:text-white"
                  >
                    <Icon name={g.icon} className="w-4 h-4 text-gray-500" />
                    <span className="flex-1 truncate">{g.label}</span>
                    {n > 0 && (
                      <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 rounded-full px-1.5">{n}</span>
                    )}
                    <Icon name="chevronRight" className="w-3 h-3 text-gray-600" />
                  </button>
                );
              })}
            </nav>
          </>
        ) : variantPicker ? (
          variantPickerList
        ) : (
          catSections.map(([name, defs], i) => renderSection(scopeKey, name, defs, i))
        )}
      </div>
    </div>
  );

  const panels: PanelDef[] = [
          { id: 'properties', title: 'Properties', icon: 'settings', weight: 3, content: properties },
          {
            id: 'layers',
            title: 'Layers',
            icon: 'layers',
            weight: 2,
            hidden: isPack,
            content: (
              <LayersPanel
                overlapping={overlapIds}
                lowContrast={lowContrast}
                layout={layout}
                selected={selected}
                valueOf={valueOf}
                setValue={setValue}
                setLayoutVals={setLayoutVals}
                selectTarget={selectTarget}
                selection={selection}
                locked={locked}
                toggleSelect={toggleSelect}
                toggleLock={toggleLock}
                linkSelection={linkSelection}
                unlinkSelection={unlinkSelection}
                selectView={selectView}
                hoverElement={hoverElement}
                openLayerMenu={openLayerMenu}
              />
            ),
          },
          { id: 'navigator', title: 'Navigator', icon: 'search', weight: 1, hidden: isPack || zoom <= 1.001, content: <NavigatorPanel /> },
          { id: 'history', title: 'History', icon: 'history', weight: 1, content: <HistoryPanel /> },
  ];

  // Folded to an icon strip (xl and up only): one button per panel, and a click unfolds the column with that panel open.
  return (
    <div className="relative min-h-0 h-[75vh] xl:h-auto">
      <ColumnResizer width={column.width} onChange={column.setWidth} />
      {column.railed && (
        <div className="hidden xl:flex h-full flex-col items-center gap-1 rounded-xl border border-gray-800 bg-gray-900/80 py-1">
          <button type="button" onClick={() => column.setRailed(false)} aria-label="Expand the side panels" title="Expand" className="w-8 h-7 flex items-center justify-center text-gray-500 hover:text-white">
            <Icon name="chevronLeft" className="w-3 h-3" />
          </button>
          {panels.filter(p => !p.hidden).map(p => (
            <button key={p.id} type="button" onClick={() => column.reveal(p.id)} aria-label={`Open ${p.title}`} title={p.title} className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:bg-white/5 hover:text-white">
              <Icon name={p.icon} />
            </button>
          ))}
        </div>
      )}
      <div className={`h-full ${column.railed ? 'xl:hidden' : ''}`}>
        <PanelStack panels={panels} collapsed={column.collapsed} onToggle={column.toggle} onRail={() => column.setRailed(true)} />
      </div>
    </div>
  );
}

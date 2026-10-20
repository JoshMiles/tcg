'use client';

import { Icon, type IconName } from '@/app/components/Icon';
import { CategoryRail } from './CategoryRail';
import { LayersPanel } from './LayersPanel';
import { LayoutPanel } from './LayoutPanel';
import { VariantPicker } from './VariantPicker';
import { PropRow } from './editor-controls';
import { PROPS, PROP_GROUPS, VARIANT_IDS, type PropDef, type VariantId } from '@/lib/overlay-props';
import { PERF_LABEL, variantPerf } from '@/lib/overlay-perf';
import { PERF_STYLE, VARIANT_LABELS, dependsOn } from './editor-types';
import { targetForSection, useOverlayEditor } from './OverlayEditorContext';

// "Layout" sits in the rail beside the registry categories but is not registry-driven: it edits the stage size and where each
// view is placed. Layout is global (not per pack), so it is hidden while editing a pack.
const LAYOUT_CAT: { id: string; label: string; icon: IconName; description: string } = {
  id: 'layout',
  label: 'Layout',
  icon: 'ruler',
  description: 'Where the overlay sits on your OBS browser source.',
};

export function PropertiesDock() {
  const {
    isPack,
    isOver,
    isScene,
    scene,
    category,
    setCategory,
    catId,
    layoutMoved,
    selected,
    modifiedCount,
    searching,
    layoutCat,
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
    layoutVals,
    mode,
    setLayoutVals,
    setPlacement,
    setNotice,
    selectTarget,
    selectView,
    hoverElement,
  } = useOverlayEditor();

  const rail = isPack ? PROP_GROUPS.filter(g => g.id !== 'collection') : [LAYOUT_CAT, ...PROP_GROUPS];
  const cat = PROP_GROUPS.find(g => g.id === catId) ?? PROP_GROUPS[0];
  const catDefs = defsFor(cat.id);
  const scopeKey = `${cat.id}${cat.id === 'variants' ? '.' + version : ''}`;
  const variantPicker = cat.id === 'variants' && !variantOpen;
  const catSections = groupSections(catDefs);

  // Search results span every category (and every version), labelled with where each one lives.
  const searchResults = searching
    ? PROP_GROUPS.flatMap(g =>
        groupSections(PROPS.filter(d => d.group === g.id && !hiddenInScope(d) && matches(d))).flatMap(
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
    const open = searching || (openMap[k] ?? index < 2);
    const changed = defs.filter(d => current[d.key] !== undefined);
    return (
      <section key={k} data-section={k} className="border-b border-gray-800/80 last:border-0">
        <div className="flex items-center gap-1 pr-2">
          <button
            type="button"
            onClick={() => {
              setOpenMap(m => ({ ...m, [k]: !open }));
              const t = targetForSection(k);
              if (t && !open) setSelected(t);
            }}
            aria-expanded={open}
            className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 text-left hover:bg-white/5"
          >
            <span
              aria-hidden
              className={`text-[10px] text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`}
            >
              <Icon name="chevronRight" className="w-3 h-3" />
            </span>
            <span className="text-sm font-semibold text-gray-200 truncate">{name || 'Settings'}</span>
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
        {open && <div className="px-3 pb-4 pt-1 space-y-4">{defs.map(renderRow)}</div>}
      </section>
    );
  };

  return (
    <div className="min-h-0 flex rounded-xl border border-gray-800 bg-gray-900/80 overflow-hidden h-[75vh] xl:h-auto">
      <CategoryRail
        rail={rail}
        countOf={id => (id === 'layout' ? layoutMoved : modifiedCount(id))}
        activeId={searching ? null : layoutCat ? 'layout' : cat.id}
        onSelect={id => {
          setCategory(id);
          setQuery('');
          if (id === 'pack' || id === 'variants' || id === 'moments' || id === 'showoff') setMode('pack');
          setShowOff(id === 'showoff');
          if (id === 'collection') setMode('collection');
          if (id === 'variants') setVariantOpen(false);
        }}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="p-3 space-y-2 border-b border-gray-800">
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search every setting…"
            aria-label="Search settings"
            className="input input-sm w-full"
          />
          {!searching && layoutCat && (
            <div className="min-w-0">
              <h3 className="font-semibold text-white text-sm">
                <Icon name={LAYOUT_CAT.icon} className="mr-1.5" />
                {LAYOUT_CAT.label}
              </h3>
              <p className="text-xs text-gray-500 leading-snug">{LAYOUT_CAT.description}</p>
            </div>
          )}
          {!searching && !layoutCat && cat.id === 'variants' && variantOpen && (
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
          {!searching && !layoutCat && !variantPicker && !(cat.id === 'variants') && (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-white text-sm">
                  <Icon name={cat.icon} className="mr-1.5" />
                  {cat.label}
                </h3>
                <p className="text-xs text-gray-500 leading-snug">{cat.description}</p>
              </div>
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
          {!searching && !layoutCat && variantPicker && (
            <div className="min-w-0">
              <h3 className="font-semibold text-white text-sm">
                <Icon name={cat.icon} className="mr-1.5" />
                {cat.label}
              </h3>
              <p className="text-xs text-gray-500 leading-snug">{cat.description}</p>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {!isPack && !searching && (
            <LayersPanel
              layout={layout}
              selected={selected}
              valueOf={valueOf}
              setValue={setValue}
              setLayoutVals={setLayoutVals}
              selectTarget={selectTarget}
              selectView={selectView}
              hoverElement={hoverElement}
            />
          )}
          {searching ? (
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
          ) : layoutCat ? (
            layoutPanel
          ) : variantPicker ? (
            variantPickerList
          ) : (
            catSections.map(([name, defs], i) => renderSection(scopeKey, name, defs, i))
          )}
        </div>
      </div>
    </div>
  );
}

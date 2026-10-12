import { Icon } from '@/app/components/Icon';
import { getActiveSeason, getPackCards, listAllPacks, listSeasons } from '@/lib/kv';
import { getOverlaySettings, getPackOverrides, getSeasonLooks, listPresets } from '@/lib/overlay-settings';
import { listVersions } from '@/lib/overlay-versions';
import { saveOverlayEditorAction, saveOverlayPresetAction, deleteOverlayPresetAction } from '../actions';
import { OverlayEditor } from './OverlayEditor';

export const dynamic = 'force-dynamic';

const SAVED_MESSAGES: Record<string, string> = {
  saved: 'Overlay saved. Use Refresh overlay (or refresh the OBS source) to see it on stream.',
  'saved-reload': 'Overlay saved. Connected overlays are refreshing themselves.',
  preset: 'Preset saved.',
  'preset-deleted': 'Preset deleted.',
};

// One editor for everything about how the overlay looks and where it sits. It is a fixed-height workspace on wide screens
// (the page itself doesn't scroll), so this page is deliberately light on chrome.
export default async function OverlayEditorPage({ searchParams }: { searchParams: Promise<{ saved?: string; scope?: string }> }) {
  const { saved, scope } = await searchParams;
  const [overlay, packs, packOverrides, presets, versions, seasons, seasonLooks, active] = await Promise.all([
    getOverlaySettings(), listAllPacks(), getPackOverrides(), listPresets(), listVersions(), listSeasons(), getSeasonLooks(), getActiveSeason().catch((): null => null),
  ]);
  const packCards = Object.fromEntries(await Promise.all(packs.map(async p => [p.id, (await getPackCards(p.id)).map(c => ({ number: c.number, name: c.name, stars: c.stars }))] as const)));
  const activeLook = active ? presets.find(p => p.id === seasonLooks[active.id]) : null;

  return (
    <div className="flex flex-col gap-3 max-w-none xl:h-[calc(100vh-4rem)]">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-2xl font-bold">Overlay Editor</h1>
        <p className="text-sm text-gray-500">Where the overlay sits on stream, and how packs, cards and collections look and move.</p>
      </div>

      {saved && SAVED_MESSAGES[saved] && (
        <div role="status" className="rounded-lg border border-green-500/30 bg-green-950/30 px-4 py-2 text-sm text-green-300 flex items-center gap-2">
          <Icon name="check" /> {SAVED_MESSAGES[saved]}
        </div>
      )}
      {activeLook && active && (
        <div role="status" className="rounded-lg border border-sky-500/30 bg-sky-950/20 px-4 py-2 text-sm text-sky-200 flex items-center gap-2">
          <Icon name="palette" /> {active.name} uses the &ldquo;{activeLook.name}&rdquo; look, layered over the global values on stream. Pack overrides still win. Change it under Presets.
        </div>
      )}

      <div className="flex-1 min-h-0">
        <OverlayEditor
          initialGlobal={overlay.props}
          initialPacks={packOverrides}
          initialLayout={overlay.layout}
          packs={packs.map(p => ({ id: p.id, name: p.name }))}
          presets={presets}
          initialScope={scope ?? 'global'}
          saveAction={saveOverlayEditorAction}
          savePresetAction={saveOverlayPresetAction}
          deletePresetAction={deleteOverlayPresetAction}
          versions={versions}
          seasons={seasons.filter(s => s.status !== 'draft').map(s => ({ id: s.id, name: s.name, active: s.active }))}
          seasonLooks={seasonLooks}
          packCards={packCards}
          initialAutoReload={overlay.autoReload}
        />
      </div>
    </div>
  );
}

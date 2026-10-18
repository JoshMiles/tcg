# lib/overlay-settings.ts

- OverlaySettings · interface · L9-L20 — interface OverlaySettings
- getOverlaySettings · function · L22-L31 — async function getOverlaySettings(): Promise<OverlaySettings>
- saveOverlaySettings · function · L33-L35 — async function saveOverlaySettings(settings: OverlaySettings): Promise<void>
- OverlayPreset · interface · L47-L47 — interface OverlayPreset
- getPackOverrides · function · L49-L57 — async function getPackOverrides(): Promise<Record<string, PropValues>>
- savePackOverrides · function · L59-L64 — async function savePackOverrides(packId: string, props: PropValues): Promise<void>
- listPresets · function · L66-L72 — async function listPresets(): Promise<OverlayPreset[]>
- savePreset · function · L74-L89 — async function savePreset(name: string, props: PropValues, layout?: OverlayLayout | null): Promise<string | null>
- updateScene · function · L92-L104 — async function updateScene(id: string, patch: { props?: PropValues; layout?: OverlayLayout }): Promise<boolean>
- getPreset · function · L106-L109 — async function getPreset(id: string | null | undefined): Promise<OverlayPreset | null>
- deletePreset · function · L111-L113 — async function deletePreset(id: string): Promise<void>
- liveGate · function · L121-L132 — async function liveGate(kind: 'pull' | 'collection'): Promise<string | null>
- getReloadToken · function · L139-L141 — async function getReloadToken(): Promise<number>
- bumpReloadToken · function · L143-L145 — async function bumpReloadToken(): Promise<void>
- getSeasonLooks · function · L151-L154 — async function getSeasonLooks(): Promise<Record<string, string>>
- setSeasonLook · function · L156-L160 — async function setSeasonLook(seasonId: string, presetId: string | null): Promise<void>
- getSeasonLookPreset · function · L163-L168 — async function getSeasonLookPreset(seasonId: string | null | undefined): Promise<OverlayPreset | null>

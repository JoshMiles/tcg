# app/admin/packs/[packId]/workspace/PackWorkspace.tsx

- WorkspaceView · type · L31-L31 — type WorkspaceView = 'edit' | 'grid' | 'odds' | 'overview';
- Base · interface · L33-L33 — interface Base extends WorkspaceState
- PackWorkspace · function · L40-L429 — function PackWorkspace({ packId, initial, seasons, overrideCount, cardBack, overview, initialView, initialSelection, healthCount, holoByStars, onStream }: { holoByStars: Record<number, HoloSpecs>; /** The pack is drawn in the active season (the overlay preview only knows those). */ onStream: boolean; packId: string; initial: WorkspaceState; seasons: SeasonUse[]; overrideCount: number; cardBack: Omit<CardBackEditorProps, 'sample'> & { sampleFallback: { name: string; imageUrl: string } }; overview: ReactNode; initialView: WorkspaceView; initialSelection: string | null; healthCount: number; })
- loadTheirs · function · L160-L165 — async function loadTheirs()
- warn · function · L170-L170 — warn = (e: BeforeUnloadEvent)
- addCard · function · L210-L215 — function addCard()
- removeCards · function · L216-L228 — function removeCards(ids: string[])
- run · function · L219-L219 — run = ()
- onKey · function · L232-L248 — onKey = (e: KeyboardEvent)
- patchCard · function · L253-L253 — patchCard = (id: string)
- editCards · function · L254-L254 — editCards = (fn: (cards: WorkCard[]) => WorkCard[], key?: string)
- patchPack · function · L255-L255 — patchPack = (patch: Partial<PackInput>, key?: string)
- publish · function · L262-L268 — async function publish()

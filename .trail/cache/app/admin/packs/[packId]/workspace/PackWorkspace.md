# app/admin/packs/[packId]/workspace/PackWorkspace.tsx

- WorkspaceView · type · L30-L30 — type WorkspaceView = 'edit' | 'grid' | 'odds' | 'overview';
- Base · interface · L32-L32 — interface Base extends WorkspaceState
- PackWorkspace · function · L39-L414 — function PackWorkspace({ packId, initial, seasons, overrideCount, cardBack, overview, initialView, initialSelection, healthCount, holoByStars, onStream }: { holoByStars: Record<number, HoloSpecs>; /** The pack is drawn in the active season (the overlay preview only knows those). */ onStream: boolean; packId: string; initial: WorkspaceState; seasons: SeasonUse[]; overrideCount: number; cardBack: Omit<CardBackEditorProps, 'sample'> & { sampleFallback: { name: string; imageUrl: string } }; overview: ReactNode; initialView: WorkspaceView; initialSelection: string | null; healthCount: number; })
- loadTheirs · function · L156-L161 — async function loadTheirs()
- warn · function · L166-L166 — warn = (e: BeforeUnloadEvent)
- addCard · function · L206-L211 — function addCard()
- removeCards · function · L212-L224 — function removeCards(ids: string[])
- run · function · L215-L215 — run = ()
- onKey · function · L228-L244 — onKey = (e: KeyboardEvent)
- patchCard · function · L249-L249 — patchCard = (id: string)
- editCards · function · L250-L250 — editCards = (fn: (cards: WorkCard[]) => WorkCard[], key?: string)
- patchPack · function · L251-L251 — patchPack = (patch: Partial<PackInput>, key?: string)
- publish · function · L258-L264 — async function publish()

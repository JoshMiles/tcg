# app/admin/packs/[packId]/workspace/PackPanel.tsx

- SeasonUse · interface · L12-L12 — interface SeasonUse
- PackPanel · function · L15-L107 — function PackPanel({ packId, pack, base, onChange, seasons, overrideCount, cardBack, readOnlyStatus }: { packId: string; pack: PackInput; base: PackInput; onChange: (patch: Partial<PackInput>, key?: string) => void; seasons: SeasonUse[]; overrideCount: number; cardBack: CardBackEditorProps; readOnlyStatus: 'draft' | 'published'; })
- changed · function · L25-L25 — changed = (...k: (keyof PackInput)[])
- pct · function · L28-L28 — pct = (n: number)

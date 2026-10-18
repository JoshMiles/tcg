# app/admin/seasons/new/SeasonFlow.tsx

- PackOption · interface · L14-L23 — interface PackOption
- SeasonFlow · function · L33-L322 — function SeasonFlow({ packs, otherCollections, initial, }: { packs: PackOption[]; /** Collection names used by other seasons (a clash would merge two seasons' viewer collections). */ otherCollections: string[]; initial?: { id: string; season: SeasonInput }; })
- set · function · L53-L53 — set = <K extends keyof SeasonInput>(key: K, value: SeasonInput[K])
- setName · function · L54-L57 — setName = (name: string)
- goNext · function · L72-L88 — async function goNext()
- saveAndExit · function · L90-L94 — async function saveAndExit()
- publish · function · L96-L105 — async function publish(activate: boolean)
- discard · function · L107-L113 — async function discard()
- togglePack · function · L115-L116 — togglePack = (id: string)
- label · function · L118-L118 — label = (id: string)
- StepTitle · function · L324-L331 — function StepTitle({ title, hint }: { title: string; hint?: string })
- Chip · function · L333-L335 — function Chip({ cls, children }: { cls: string; children: React.ReactNode })
- Summary · function · L337-L344 — function Summary({ label, value }: { label: string; value: string })

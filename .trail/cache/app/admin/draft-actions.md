# app/admin/draft-actions.ts

- createDraftPack · function · L25-L32 — async function createDraftPack(input: PackInput): Promise<{ id: string }>
- saveDraftPack · function · L35-L41 — async function saveDraftPack(id: string, input: PackInput): Promise<void>
- CardInput · interface · L43-L56 — interface CardInput
- saveCards · function · L63-L101 — async function saveCards(packId: string, rows: CardInput[]): Promise<Card[]>
- publishPack · function · L104-L117 — async function publishPack(id: string, active: boolean): Promise<{ ok: true } | { ok: false; issues: Issue[] }>
- unpublishPack · function · L120-L128 — async function unpublishPack(id: string): Promise<void>
- discardDraftPack · function · L130-L136 — async function discardDraftPack(id: string): Promise<void>
- SeasonInput · interface · L140-L149 — interface SeasonInput
- cleanSeasonInput · function · L151-L161 — function cleanSeasonInput(i: SeasonInput): Omit<Season, 'id' | 'createdAt' | 'status' | 'active'>
- createDraftSeason · function · L163-L168 — async function createDraftSeason(input: SeasonInput): Promise<{ id: string }>
- saveDraftSeason · function · L170-L176 — async function saveDraftSeason(id: string, input: SeasonInput): Promise<void>
- publishSeason · function · L179-L194 — async function publishSeason(id: string, activate: boolean): Promise<{ ok: true } | { ok: false; issues: Issue[] }>
- unpublishSeason · function · L202-L210 — async function unpublishSeason(id: string): Promise<void>
- discardDraftSeason · function · L212-L218 — async function discardDraftSeason(id: string): Promise<void>

# app/(site)/cards/CardDex.tsx

- DexOwner · interface · L20-L26 — interface DexOwner
- DexCard · interface · L28-L57 — interface DexCard
- oneIn · function · L61-L61 — oneIn = (p: number)
- artFor · function · L62-L62 — artFor = (c: DexCard, v: Variant)
- maskFor · function · L63-L63 — maskFor = (c: DexCard, url: string)
- CardDex · function · L66-L212 — function CardDex({ cards, seasonId, siteHost, signedIn = false, compactDefault = false, showMine = false, initialOpenId }: { cards: DexCard[]; seasonId: string; siteHost: string; signedIn?: boolean; compactDefault?: boolean; showMine?: boolean; initialOpenId?: string })
- patch · function · L68-L68 — patch = (p: Partial<DexFilter>)
- toggleWanted · function · L84-L90 — async function toggleWanted(c: DexCard)
- DexDetail · function · L216-L368 — function DexDetail({ card, seasonId, siteHost, signedIn, onToggleWanted, canStep, onClose, onStep }: { card: DexCard; seasonId: string; siteHost: string; signedIn: boolean; onToggleWanted: (c: DexCard) => void; canStep: boolean; onClose: () => void; onStep: (d: number) => void })
- onKey · function · L227-L231 — onKey = (e: KeyboardEvent)
- Stat · function · L370-L378 — function Stat({ label, value, sub, tip }: { label: string; value: string; sub: string; tip?: TermId })
- FullArt · function · L381-L394 — function FullArt({ url }: { url: string })
- Chip · function · L396-L408 — function Chip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode })

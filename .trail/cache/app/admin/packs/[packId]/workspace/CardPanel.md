# app/admin/packs/[packId]/workspace/CardPanel.tsx

- CardPanel · function · L14-L96 — function CardPanel({ card, cards, pack, locked, changed, onChange, onRemove }: { card: WorkCard; cards: WorkCard[]; pack: PackInput; /** Viewers hold this card, so its number is fixed. */ locked: boolean; changed: Set<keyof CardFields>; onChange: (patch: Partial<CardFields>, key?: string) => void; onRemove: () => void; })
- dot · function · L27-L27 — dot = (...k: (keyof CardFields)[])
- jump · function · L28-L28 — jump = (id: string)

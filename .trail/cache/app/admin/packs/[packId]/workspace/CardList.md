# app/admin/packs/[packId]/workspace/CardList.tsx

- Sort · type · L11-L11 — type Sort = 'number' | 'name' | 'stars' | 'chance' | 'problems';
- cardMarks · function · L14-L22 — function cardMarks(c: WorkCard, pack: PackInput): { id: string; label: string }[]
- CardList · function · L24-L124 — function CardList({ pack, cards, problemIds, selected, focus, packRow, onSelect, onAdd, onDeleteSelected, changedIds, searchRef, }: { pack: PackInput; cards: WorkCard[]; problemIds: Set<string>; selected: Set<string>; focus: string | null; packRow: { changed: boolean; problem: boolean }; /** `mode`: replace the selection, toggle one card, or extend from the last click to this card. */ onSelect: (id: string, mode: 'replace' | 'toggle' | 'range', visible: string[]) => void; onAdd: () => void; onDeleteSelected: () => void; changedIds: Set<string>; searchRef: React.RefObject<HTMLInputElement | null>; })

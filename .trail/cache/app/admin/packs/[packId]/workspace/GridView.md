# app/admin/packs/[packId]/workspace/GridView.tsx

- Col · type · L13-L13 — type Col = 'name' | 'stars' | 'weight';
- GridView · function · L21-L138 — function GridView({ pack, cards, held, selected, focus, problemIds, onSelect, editCards, only, onShowAll }: { /** Show only these cards (the ones just imported); null shows all. */ only?: Set<string> | null; onShowAll?: () => void; pack: PackInput; cards: WorkCard[]; held: Set<number>; selected: Set<string>; focus: string | null; problemIds: Set<string>; onSelect: (id: string, mode: 'replace' | 'toggle' | 'range', visible: string[]) => void; editCards: (fn: (cards: WorkCard[]) => WorkCard[], key?: string) => void; })
- patch · function · L40-L40 — patch = (id: string, p: Partial<CardFields>, key?: string)
- moveTo · function · L42-L45 — function moveTo(col: Col, rowIdx: number)
- onKey · function · L46-L48 — function onKey(e: React.KeyboardEvent, col: Col, i: number)
- onPaste · function · L49-L62 — function onPaste(e: React.ClipboardEvent, col: Col, i: number)
- fillDown · function · L63-L69 — function fillDown(col: 'stars' | 'weight')

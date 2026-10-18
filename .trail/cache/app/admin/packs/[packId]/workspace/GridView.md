# app/admin/packs/[packId]/workspace/GridView.tsx

- Col · type · L13-L13 — type Col = 'name' | 'stars' | 'weight';
- GridView · function · L21-L134 — function GridView({ pack, cards, held, selected, focus, problemIds, onSelect, editCards }: { pack: PackInput; cards: WorkCard[]; held: Set<number>; selected: Set<string>; focus: string | null; problemIds: Set<string>; onSelect: (id: string, mode: 'replace' | 'toggle' | 'range', visible: string[]) => void; editCards: (fn: (cards: WorkCard[]) => WorkCard[], key?: string) => void; })
- patch · function · L37-L37 — patch = (id: string, p: Partial<CardFields>, key?: string)
- moveTo · function · L39-L42 — function moveTo(col: Col, rowIdx: number)
- onKey · function · L43-L45 — function onKey(e: React.KeyboardEvent, col: Col, i: number)
- onPaste · function · L46-L59 — function onPaste(e: React.ClipboardEvent, col: Col, i: number)
- fillDown · function · L60-L66 — function fillDown(col: 'stars' | 'weight')

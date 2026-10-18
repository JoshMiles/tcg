# app/admin/components/card-back/Layers.tsx

- Layers · function · L13-L82 — function Layers({ style, selection, boxes, onSelect, onChange }: { style: CardBackStyle; selection: Set<string>; boxes: Record<string, Box>; onSelect: (ids: Set<string>) => void; /** `key` coalesces repeated edits into one undo step. */ onChange: (next: CardBackStyle, key?: string) => void; onGesture?: () => void; })
- label · function · L27-L27 — label = (id: string)
- click · function · L28-L33 — click = (id: string, shift: boolean)
- add · function · L34-L34 — add = ()

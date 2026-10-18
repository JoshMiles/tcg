# app/admin/components/card-back/Canvas.tsx

- Boxes · type · L11-L11 — type Boxes = Record<string, Box & { fontPx: number }>;
- Drag · interface · L13-L22 — interface Drag
- Canvas · function · L30-L212 — function Canvas({ style, back, width, selection, onSelect, onGesture, onChange, onBoxes }: { style: CardBackStyle; back: FlipBack; width: number; /** Ids of the selected elements, or `bg` for the background. */ selection: Set<string>; onSelect: (ids: Set<string>) => void; /** Called once when an edit gesture starts (so the whole drag is one undo step); `key` coalesces repeated nudges. */ onGesture: (key?: string) => void; onChange: (next: CardBackStyle) => void; onBoxes?: (b: Boxes) => void; })
- round · function · L60-L60 — round = (b: Boxes)
- f · function · L65-L65 — f = ()
- cardRect · function · L70-L70 — cardRect = ()
- pct · function · L71-L71 — pct = (e: { clientX: number; clientY: number })
- selectOnDown · function · L73-L79 — function selectOnDown(id: string, shift: boolean): string[]
- start · function · L81-L87 — function start(e: React.PointerEvent, id: string, mode: Drag['mode'])
- move · function · L89-L144 — function move(e: React.PointerEvent)
- baseEl · function · L110-L110 — baseEl = (id: string)
- end · function · L146-L161 — function end(e: React.PointerEvent)
- bgDown · function · L163-L167 — function bgDown(e: React.PointerEvent)
- key · function · L169-L178 — function key(e: React.KeyboardEvent)

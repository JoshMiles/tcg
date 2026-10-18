# app/u/[username]/Binder.tsx

- total · function · L22-L22 — total = (c: VariantCounts)
- bestOf · function · L23-L23 — bestOf = (c: VariantCounts)
- artOf · function · L24-L24 — artOf = (c: GridCard, v: string)
- BinderEditorBridge · interface · L28-L35 — interface BinderEditorBridge
- usePrefs · function · L37-L49 — function usePrefs()
- sync · function · L43-L43 — sync = ()
- Binder · function · L51-L271 — function Binder({ cards, ownerLabel, onOpen, config = DEFAULT_BINDER, seasonId, editor, shareFooter }: { cards: GridCard[]; ownerLabel: string; onOpen: (idx: number, el: HTMLElement | null) => void; config?: BinderConfig; seasonId?: string; editor?: BinderEditorBridge; /** Shows a "Share this page" button; this is the footer line of the image (the site address). */ shareFooter?: string; })
- onDown · function · L108-L108 — onDown = (e: React.PointerEvent)
- onUp · function · L109-L117 — onUp = (e: React.PointerEvent)
- swallowTap · function · L118-L118 — swallowTap = (e: React.MouseEvent)
- onKey · function · L120-L124 — onKey = (e: React.KeyboardEvent)
- slotBody · function · L133-L134 — slotBody = (idx: number | null, pin: Variant | null, key: string, open: (el: HTMLElement | null) => void)
- pageView · function · L136-L173 — pageView = (p: BinderPage | undefined, side: 'left' | 'right')
- Pocket · function · L273-L311 — function Pocket({ card, pin, cfg, onOpen }: { card: GridCard; pin: Variant | null; cfg: BinderConfig; onOpen: (el: HTMLElement | null) => void })

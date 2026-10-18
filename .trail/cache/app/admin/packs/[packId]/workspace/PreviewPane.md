# app/admin/packs/[packId]/workspace/PreviewPane.tsx

- Tab · type · L15-L15 — type Tab = 'card' | 'back' | 'stream' | 'sizes';
- PreviewPaneProps · interface · L18-L33 — interface PreviewPaneProps
- PreviewPane · function · L36-L61 — function PreviewPane(p: PreviewPaneProps)
- hexOf · function · L63-L63 — hexOf = (c: WorkCard)
- variantsFor · function · L65-L67 — function variantsFor(pack: PackInput, c: WorkCard): Variant[]
- artOf · function · L69-L71 — function artOf(c: WorkCard, v: Variant)
- Front · function · L74-L82 — function Front({ c, v, holo, animated, className = '' }: { c: WorkCard; v: Variant; holo: HoloSpecs | undefined; animated: boolean; className?: string })
- FrontTab · function · L84-L113 — function FrontTab({ pack, card, shown, holoByStars }: PreviewPaneProps & { shown: WorkCard })
- BackTab · function · L115-L133 — function BackTab({ pack, shown, holoByStars, cardBack, seasonName }: PreviewPaneProps & { shown: WorkCard })
- StreamTab · function · L137-L189 — function StreamTab({ packId, pack, shown, onStream }: PreviewPaneProps & { shown: WorkCard })
- post · function · L164-L164 — post = (m: object)
- SizesTab · function · L191-L211 — function SizesTab({ pack, shown, holoByStars }: PreviewPaneProps & { shown: WorkCard })
- label · function · L193-L193 — label = (t: string)
- ContactSheet · function · L213-L229 — function ContactSheet({ cards }: { cards: WorkCard[] })

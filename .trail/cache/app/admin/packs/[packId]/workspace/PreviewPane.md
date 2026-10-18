# app/admin/packs/[packId]/workspace/PreviewPane.tsx

- Tab · type · L16-L16 — type Tab = 'card' | 'back' | 'stream' | 'sizes';
- PreviewPaneProps · interface · L19-L34 — interface PreviewPaneProps
- PreviewPane · function · L37-L62 — function PreviewPane(p: PreviewPaneProps)
- hexOf · function · L64-L64 — hexOf = (c: WorkCard)
- variantsFor · function · L66-L68 — function variantsFor(pack: PackInput, c: WorkCard): Variant[]
- artOf · function · L70-L72 — function artOf(c: WorkCard, v: Variant)
- Front · function · L75-L83 — function Front({ c, v, holo, animated, className = '' }: { c: WorkCard; v: Variant; holo: HoloSpecs | undefined; animated: boolean; className?: string })
- FrontTab · function · L85-L114 — function FrontTab({ pack, card, shown, holoByStars }: PreviewPaneProps & { shown: WorkCard })
- BackTab · function · L116-L131 — function BackTab({ pack, shown, holoByStars, cardBack, seasonName }: PreviewPaneProps & { shown: WorkCard })
- StreamTab · function · L135-L187 — function StreamTab({ packId, pack, shown, onStream }: PreviewPaneProps & { shown: WorkCard })
- post · function · L162-L162 — post = (m: object)
- SizesTab · function · L189-L209 — function SizesTab({ pack, shown, holoByStars }: PreviewPaneProps & { shown: WorkCard })
- label · function · L191-L191 — label = (t: string)
- ContactSheet · function · L211-L227 — function ContactSheet({ cards }: { cards: WorkCard[] })

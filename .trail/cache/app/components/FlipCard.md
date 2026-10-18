# app/components/FlipCard.tsx

- FlipCard · function · L18-L107 — function FlipCard({ children, back, compact = false, className = '', defaultFlipped = false, bare = false }: { children: ReactNode; back: FlipBack; compact?: boolean; className?: string; defaultFlipped?: boolean; /** Just the back, flat: no turning, tilting or button (the card back editor draws on it). */ bare?: boolean })
- qrOf · function · L41-L41 — qrOf = (n: BackNode)
- move · function · L43-L54 — function move(e: React.PointerEvent<HTMLDivElement>)
- rest · function · L55-L59 — function rest()
- flip · function · L60-L64 — function flip()
- BackNodeView · function · L110-L128 — function BackNodeView({ n, qr, flipped }: { n: BackNode; qr: { d: string; size: number } | null; flipped: boolean })

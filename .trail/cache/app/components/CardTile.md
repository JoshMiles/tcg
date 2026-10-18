# app/components/CardTile.tsx

- CardTile · function · L11-L67 — function CardTile({ imageUrl, still, alt, className, style, title, onActivate, children, }: { imageUrl: string; /** A chosen still frame (card.stillUrl); without it the thumbnail (the first frame) is the still. */ still?: string; alt: string; className?: string; style?: CSSProperties; title?: string; /** Makes the tile a button; called with the tile element on click / Enter / Space. */ onActivate?: (el: HTMLElement) => void; children?: ReactNode; })

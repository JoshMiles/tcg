# lib/card-art.ts

- cardThumbUrl · function · L8-L12 — function cardThumbUrl(imageUrl: string): string
- StillFields · interface · L15-L15 — interface StillFields
- cardStill · function · L18-L21 — function cardStill(card: StillFields, which: 'art' | 'fullArt' = 'art'): string
- stillFor · function · L24-L28 — function stillFor(card: Partial<StillFields>, url: string): string
- isFrameSourceUrl · function · L34-L37 — function isFrameSourceUrl(url: string): boolean
- stillBlobPath · function · L40-L42 — function stillBlobPath(id: string, frame: number): string
- optimizedCardPaths · function · L45-L47 — function optimizedCardPaths(id: string): { full: string; thumb: string }
- isBlobUrl · function · L51-L53 — function isBlobUrl(url: string): boolean

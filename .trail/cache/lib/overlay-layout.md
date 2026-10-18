# lib/overlay-layout.ts

- Placement · interface · L9-L13 — interface Placement
- OverlayLayout · interface · L15-L20 — interface OverlayLayout
- LayoutMode · type · L22-L22 — type LayoutMode = 'pack' | 'collection';
- isVertical · function · L47-L47 — isVertical = (l: { width: number; height: number })
- sceneLayout · function · L53-L56 — function sceneLayout(kind: 'landscape' | 'vertical', base: OverlayLayout = DEFAULT_LAYOUT): OverlayLayout
- clamp · function · L58-L58 — clamp = (n: number, lo: number, hi: number)
- num · function · L59-L62 — num = (v: unknown, fallback: number)
- Loose · type · L64-L64 — type Loose = Record<string, unknown>;
- sanitizePlacement · function · L66-L73 — function sanitizePlacement(input: unknown, fallback: Placement = DEFAULT_PLACEMENT): Placement
- sanitizeLayout · function · L80-L89 — function sanitizeLayout(input: unknown): OverlayLayout

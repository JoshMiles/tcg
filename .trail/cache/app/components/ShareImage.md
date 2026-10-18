# app/components/ShareImage.tsx

- loadImage · function · L12-L24 — function loadImage(src: string): Promise<HTMLImageElement | null>
- roundRect · function · L26-L29 — function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number)
- spaced · function · L32-L34 — function spaced(ctx: CanvasRenderingContext2D, px: number)
- drawPlate · function · L39-L123 — function drawPlate(ctx: CanvasRenderingContext2D, p: NonNullable<ShareSpec['plate']>, rarityEdge: string, font: string, t: ShareTheme, h: number)
- engrave · function · L81-L87 — engrave = (text: string, x: number, y: number, size: number, weight: number, fill: string, maxW: number, family = font, spacing = 0)
- roundRectR · function · L126-L135 — function roundRectR(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: [number, number, number, number])
- drawLeather · function · L138-L175 — function drawLeather(ctx: CanvasRenderingContext2D, r: Rect, b: BinderShare)
- drawPocket · function · L178-L241 — function drawPocket(ctx: CanvasRenderingContext2D, r: Rect, slot: BinderShareSlot | null, img: HTMLImageElement | null, b: BinderShare, k: number, font: string)
- pill · function · L230-L237 — pill = (text: string, x: number, y: number, size: number, fill: string, line: string, ink: string, rightAlign = false)
- drawStatsCard · function · L244-L299 — async function drawStatsCard(ctx: CanvasRenderingContext2D, spec: ShareSpec, H: number, font: string, t: ShareTheme, preview: boolean)
- drawBinder · function · L302-L354 — async function drawBinder(ctx: CanvasRenderingContext2D, b: BinderShare, H: number, font: string, preview: boolean)
- renderShare · function · L357-L451 — async function renderShare(spec: ShareSpec, opts?: { preview?: boolean }): Promise<HTMLCanvasElement>
- ExportResult · type · L453-L453 — type ExportResult = 'shared' | 'downloaded' | 'cancelled';
- exportShare · function · L456-L472 — async function exportShare(spec: ShareSpec, filename: string, extra?: { text?: string; url?: string; download?: boolean }): Promise<ExportResult>
- ShareImageButton · function · L475-L488 — function ShareImageButton({ spec, filename, label = 'Share image', className }: { spec: ShareSpec; filename: string; label?: string; className?: string })
- go · function · L478-L481 — async function go()

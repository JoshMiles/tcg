# lib/palette.ts

- PaletteGroup · type · L7-L7 — type PaletteGroup = 'Pages' | 'Actions' | 'Packs' | 'Seasons' | 'Users';
- PaletteAction · type · L8-L8 — type PaletteAction = 'copy-overlay' | 'open-preview' | 'exit-sandbox' | 'logout';
- PaletteItem · interface · L10-L21 — interface PaletteItem
- norm · function · L39-L39 — norm = (s: string)
- subsequence · function · L42-L46 — function subsequence(q: string, s: string): boolean
- scoreItem · function · L49-L62 — function scoreItem(item: Pick<PaletteItem, 'label' | 'hint' | 'keywords'>, query: string): number
- rankItems · function · L65-L73 — function rankItems(items: PaletteItem[], query: string, limit = 30): PaletteItem[]

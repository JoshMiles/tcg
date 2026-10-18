# app/admin/assets/AssetBrowser.tsx

- AssetTab · type · L18-L18 — type AssetTab = AssetKind | 'unused' | 'insights';
- Sort · type · L19-L19 — type Sort = 'default' | 'size' | 'issues';
- View · type · L20-L20 — type View = 'grid' | 'list' | 'compact';
- FixNote · type · L21-L21 — type FixNote = { ok: boolean; message: string };
- AssetBrowser · function · L33-L239 — function AssetBrowser({ library, tab, issuesOnly }: { library: AssetLibrary; tab: AssetTab; issuesOnly?: boolean })
- chooseView · function · L55-L55 — chooseView = (v: View)
- copy · function · L85-L88 — function copy(url: string)
- toggle · function · L89-L89 — toggle = (id: string)
- runFix · function · L92-L112 — async function runFix(list: LibraryAsset[])
- Preview · function · L241-L247 — function Preview({ asset, className }: { asset: LibraryAsset; className?: string })
- useDrop · function · L249-L259 — function useDrop(onDropFile: (f: File) => void)
- Check · function · L261-L266 — Check = ({ on, onToggle, label, always }: { on: boolean; onToggle: () => void; label: string; always?: boolean })
- BusyOverlay · function · L268-L275 — function BusyOverlay({ over, busy }: { over: boolean; busy: boolean })
- AssetTile · function · L277-L300 — function AssetTile({ asset, compact, selected, onToggle, onOpen, busy, onDropFile }: { asset: LibraryAsset; compact: boolean; selected: boolean; onToggle: () => void; onOpen: () => void; busy: boolean; onDropFile: (f: File) => void })
- AssetRow · function · L302-L323 — function AssetRow({ asset, maxBytes, selected, onToggle, onOpen, busy, onDropFile }: { asset: LibraryAsset; maxBytes: number; selected: boolean; onToggle: () => void; onOpen: () => void; busy: boolean; onDropFile: (f: File) => void })

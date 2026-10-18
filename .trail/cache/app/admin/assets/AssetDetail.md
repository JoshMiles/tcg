# app/admin/assets/AssetDetail.tsx

- DropZone · function · L14-L29 — function DropZone({ kind, busy, onFile, compact }: { kind: LibraryAsset['kind']; busy: boolean; onFile: (f: File) => void; compact?: boolean })
- AssetDetail · function · L31-L161 — function AssetDetail({ asset, index, total, onClose, onStep, onCopy, copied, onFix, fixing, fixNote, onReplace, replacing, replaceError, onOptimiseCover, optimising, optNote }: { asset: LibraryAsset; index: number; total: number; onClose: () => void; onStep: (d: -1 | 1) => void; onCopy: () => void; copied: boolean; onFix: () => void; fixing: boolean; fixNote?: { ok: boolean; message: string } | null; onReplace: (f: File) => void; replacing: boolean; replaceError: string | null; /** Shrink this pack cover on the server. */ onOptimiseCover: () => void; optimising: boolean; optNote?: OptNote | null; })
- t · function · L42-L47 — t = (e: KeyboardEvent)
- Fact · function · L163-L165 — function Fact({ label, value, tone }: { label: string; value: string; tone?: 'amber' })

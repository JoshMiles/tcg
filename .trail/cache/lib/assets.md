# lib/assets.ts

- AssetKind · type · L9-L9 — type AssetKind = 'card-art' | 'pack-cover' | 'sound';
- AssetOrigin · type · L11-L13 — type AssetOrigin = | { kind: 'pack-cover'; packId: string; packName: string } | { kind: 'card-art' | 'sound'; packId: string; packName: string; cardId: string; cardName: string; cardNumber: number };
- AssetIssue · type · L15-L19 — type AssetIssue = | 'legacy-gif' // still a (large) GIF, re-upload to get the optimized WebP | 'missing' // the URL doesn't resolve | 'no-thumbnail' // card art whose static thumbnail is missing (grids would show a broken image) | 'heavy';
- AssetKey · interface · L22-L22 — interface AssetKey
- assetId · function · L24-L24 — assetId = (k: AssetKey): string
- keyOf · function · L25-L25 — keyOf = (o: AssetOrigin, kind: AssetKind): AssetKey
- LibraryAsset · interface · L27-L37 — interface LibraryAsset
- UnusedBlob · interface · L39-L45 — interface UnusedBlob
- BlobProblem · type · L48-L48 — type BlobProblem = { kind: 'no-token' } | { kind: 'error'; message: string };
- AssetLibrary · interface · L50-L55 — interface AssetLibrary
- formatOf · function · L60-L63 — function formatOf(url: string): string
- collectReferenced · function · L66-L90 — async function collectReferenced()
- withTimeout · function · L92-L100 — function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T>
- listAllBlobs · function · L102-L128 — async function listAllBlobs(): Promise<{ connected: boolean; problem?: BlobProblem; blobs: { url: string; pathname: string; size: number; uploadedAt: Date }[]; }>
- headLocal · function · L131-L141 — async function headLocal(origin: string, path: string): Promise<{ bytes: number | null; exists: boolean | null }>
- loadAssetLibrary · function · L143-L190 — async function loadAssetLibrary(origin: string): Promise<AssetLibrary>
- pickDeletable · function · L193-L195 — function pickDeletable(requested: string[], inStore: Set<string>, referenced: Set<string>): string[]
- deleteUnusedBlobs · function · L202-L216 — async function deleteUnusedBlobs(urls: string[]): Promise<number>

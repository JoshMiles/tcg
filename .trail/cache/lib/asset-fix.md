# lib/asset-fix.ts

- FixResult · interface · L12-L12 — interface FixResult
- Ref · interface · L14-L14 — interface Ref
- resolveRef · function · L16-L30 — async function resolveRef(key: AssetKey): Promise<Ref | null>
- absolute · function · L32-L32 — absolute = (url: string, origin: string)
- fail · function · L33-L33 — fail = (message: string): FixResult
- acceptableAssetUrl · function · L39-L43 — function acceptableAssetUrl(kind: AssetKey['kind'], url: string): boolean
- replaceAsset · function · L46-L52 — async function replaceAsset(key: AssetKey, newUrl: string): Promise<FixResult>
- fixAsset · function · L58-L101 — async function fixAsset(key: AssetKey, origin: string): Promise<FixResult>
- optimizeCover · function · L111-L134 — async function optimizeCover(key: AssetKey, origin: string): Promise<FixResult>
- fmt · function · L136-L136 — function fmt(b: number)

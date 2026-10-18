# lib/asset-fix.ts

- FixResult · interface · L12-L12 — interface FixResult
- Ref · interface · L14-L14 — interface Ref
- resolveRef · function · L16-L30 — async function resolveRef(key: AssetKey): Promise<Ref | null>
- fetchUrl · function · L33-L37 — function fetchUrl(url: string, origin: string): string | null
- fail · function · L38-L38 — fail = (message: string): FixResult
- acceptableAssetUrl · function · L44-L48 — function acceptableAssetUrl(kind: AssetKey['kind'], url: string): boolean
- replaceAsset · function · L51-L57 — async function replaceAsset(key: AssetKey, newUrl: string): Promise<FixResult>
- fixAsset · function · L63-L108 — async function fixAsset(key: AssetKey, origin: string): Promise<FixResult>
- optimizeCover · function · L118-L142 — async function optimizeCover(key: AssetKey, origin: string): Promise<FixResult>
- fmt · function · L144-L144 — function fmt(b: number)

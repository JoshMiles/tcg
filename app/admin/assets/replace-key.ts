import type { AssetKey, LibraryAsset } from '@/lib/assets';

/** The key the server actions take for a library asset. */
export const keyOf = (a: LibraryAsset): AssetKey => ({ kind: a.kind, packId: a.origin.packId, cardId: a.origin.kind === 'pack-cover' ? undefined : a.origin.cardId });

export { fileSuits } from './asset-ui';

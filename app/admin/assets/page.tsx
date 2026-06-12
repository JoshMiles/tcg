import { listAllPacks, getPackCards } from '@/lib/kv';
import { AssetBrowser } from './AssetBrowser';

export const dynamic = 'force-dynamic';

export type AssetOrigin =
  | { kind: 'pack-cover'; packId: string; packName: string }
  | { kind: 'card-image' | 'card-sound'; packId: string; packName: string; cardId: string; cardName: string; cardNumber: number };

export type AssetType = 'gif' | 'image' | 'audio';

export type AssetItem = {
  url: string;
  type: AssetType;
  origin: AssetOrigin;
};

function classify(url: string): AssetType | null {
  if (!url) return null;
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.gif')) return 'gif';
  if (/\.(mp3|wav|ogg|webm|m4a)$/.test(path)) return 'audio';
  if (/\.(png|jpg|jpeg|webp|svg)$/.test(path)) return 'image';
  return null;
}

export default async function AssetsPage() {
  const packs = await listAllPacks();
  const cardLists = await Promise.all(packs.map(p => getPackCards(p.id)));

  const assets: AssetItem[] = [];

  packs.forEach((pack, i) => {
    const type = classify(pack.coverImageUrl);
    if (type) {
      assets.push({ url: pack.coverImageUrl, type, origin: { kind: 'pack-cover', packId: pack.id, packName: pack.name } });
    }

    for (const card of cardLists[i]) {
      const imgType = classify(card.imageUrl);
      if (imgType) {
        assets.push({
          url: card.imageUrl,
          type: imgType,
          origin: { kind: 'card-image', packId: pack.id, packName: pack.name, cardId: card.id, cardName: card.name, cardNumber: card.number },
        });
      }
      if (card.soundUrl) {
        const sndType = classify(card.soundUrl);
        if (sndType) {
          assets.push({
            url: card.soundUrl,
            type: sndType,
            origin: { kind: 'card-sound', packId: pack.id, packName: pack.name, cardId: card.id, cardName: card.name, cardNumber: card.number },
          });
        }
      }
    }
  });

  const counts = {
    gif:   assets.filter(a => a.type === 'gif').length,
    image: assets.filter(a => a.type === 'image').length,
    audio: assets.filter(a => a.type === 'audio').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Assets</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {counts.gif} GIF{counts.gif !== 1 ? 's' : ''} · {counts.image} image{counts.image !== 1 ? 's' : ''} · {counts.audio} audio file{counts.audio !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <AssetBrowser assets={assets} />
    </div>
  );
}

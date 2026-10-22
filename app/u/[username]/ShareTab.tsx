import { ShareStudioLazy as ShareStudio } from '@/app/components/ShareStudioLazy';
import type { BigStat, ShareCard, ShareSpec } from '@/lib/share-image';

/** The owner's Share tab: choose a theme, a shape and which cards go in, preview the image, then share, save or post it. */
export function ShareTab({ base, candidates, bigStats, link, username, discordOn }: {
  base: Omit<ShareSpec, 'cards'>;
  candidates: ShareCard[];
  bigStats: BigStat[];
  link: string;
  username: string;
  /** A Shares channel is on. The button still shows when this is false, and says so instead of uploading. */
  discordOn: boolean;
}) {
  return (
    <section className="card rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold text-white">Make a share image</h2>
        <p className="text-sm text-gray-400 mt-1">Pick a look and the cards you want to show off. The image is made in your browser. Post to Discord sends it once. We do not keep a copy.</p>
      </div>
      {candidates.length === 0
        ? <p className="text-sm text-gray-500">Pull a few cards first, then come back to make an image.</p>
        : <ShareStudio base={{ ...base, cards: [] }} candidates={candidates} bigStats={bigStats} link={link} filename={`cheesy-tcg-${username}.png`} shareText={`${base.title} on The Cheesy TCG`} discordOn={discordOn} />}
    </section>
  );
}

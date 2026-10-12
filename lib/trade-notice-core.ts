import type { Variant } from './types';
import type { IconName } from '@/app/components/Icon';

import type { HoloSpecs } from './holo-core';

// Client-safe shapes for trade notifications and the trade animation.

/** A stack of cards as the trade animation / notifications draw them. */
export interface SwapCard {
  number: number;
  name: string;
  imageUrl: string;
  fullArtImageUrl?: string;
  variant: Variant;
  count: number;
  /** The holographic shimmer per variant (the Overlay Editor's settings), so the animation matches the card everywhere else. */
  holo?: HoloSpecs;
}

/** What changed hands, from one person's point of view. */
export interface Swap {
  /** The other person. */
  with: string;
  gave: SwapCard[];
  got: SwapCard[];
}

export type NoticeKind = 'offer' | 'countered' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'admin' | 'watch';

/** One item in a viewer's notification bell. */
export interface Notice {
  id: string;
  at: number;
  kind: NoticeKind;
  text: string;
  /** The offer it is about, so the bell can link to /trade. */
  tradeId?: string;
  /** Present on 'accepted': lets the site replay the trade animation. */
  swap?: Swap;
}

export const NOTICE_ICON: Record<NoticeKind, IconName> = {
  offer: 'inbox', countered: 'undo', accepted: 'party', declined: 'ban', cancelled: 'x', expired: 'hourglass', admin: 'shield', watch: 'search',
};

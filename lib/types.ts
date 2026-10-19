/** Card variants, lowest to highest. Upgrades only ever move one step up this ladder. */
export type Variant = 'regular' | 'reverse' | 'full' | 'shiny';

export type VariantWeights = Record<Variant, number>;

/** Variants that can be switched off (Regular always exists). */
export type OptionalVariant = Exclude<Variant, 'regular'>;

/** Duplicates of the previous variant needed to craft each variant (regular can't be crafted). */
export type UpgradeCosts = Record<Exclude<Variant, 'regular'>, number>;

/** Drafts are saved work-in-progress: never drawn, never activatable, hidden from viewers until published. */
export type DraftStatus = 'draft' | 'published';

export interface Season {
  id: string;
  name: string;
  collectionName: string;
  active: boolean;
  status: DraftStatus;
  createdAt: number;
  maxConcurrentPacks: number;
  packIds: string[];          // ordered list of pack IDs used by this season
  /** Optional schedule (ms). With `autoStart` the season switches itself on at `startsAt`; at `endsAt` an active season is wrapped up. */
  startsAt?: number;
  endsAt?: number;
  autoStart?: boolean;
  /** Set when the season was wrapped up (final standings snapshot taken). */
  endedAt?: number;
  /** No new trades or acceptances for this season (set automatically at wrap-up). */
  tradingFrozen?: boolean;
}

export interface Pack {
  id: string;
  name: string;
  coverImageUrl: string;
  active: boolean;
  status: DraftStatus;
  weight: number;             // relative draw weight when multiple packs are in a season
  accentColor: string;
  tearBorderColor: string;
  holoMinStars: number;
  cardTime: number;
  cooldownTime: number;
  soundVolume: number;
  createdAt: number;
  upgradesEnabled: boolean;   // variants + upgrades; off for Season 1 style packs
  variantWeights: VariantWeights;
  upgradeCosts: UpgradeCosts;
  disabledVariants?: OptionalVariant[];   // never rolled and skipped by upgrades in this pack
  /** Retired: hidden from the library and never drawn, but its cards stay (viewer collections point at them). */
  archived?: boolean;
  archivedAt?: number;
}

export type CardKind = 'collector' | 'trainer';

export interface Card {
  id: string;
  number: number;
  name: string;
  imageUrl: string;
  soundUrl?: string;          // overrides the default assets/sounds/{number}.mp3
  probability: number;
  stars: number;              // 1–5
  upgradesEnabled?: boolean;  // per-card opt-out; undefined = follow the pack
  fullArtImageUrl?: string;   // art for the Full Art / Shiny variants
  /** A chosen still frame of animated art (a Blob webp). Without it the static image is the first frame. See cardStill(). */
  stillUrl?: string;
  fullArtStillUrl?: string;   // the same for the full-art image
  disabledVariants?: OptionalVariant[];   // variants this card can't be (on top of the pack's own switches)
  /** Card kind: absent or 'collector' is an ordinary card; 'trainer' grants a buff when used (ROADMAP 30.1). */
  kind?: CardKind;
  /** The buff definition id from `trainer:buffs` when `kind === 'trainer'`. */
  buffId?: string;
}

export interface UserProfile {
  username: string;       // lowercase, canonical key
  displayName: string;    // Twitch display name or custom label
  twitchId?: string;
  notes?: string;       // private admin notes
  createdAt: number;
  /** Admin-only labels (VIP, moderator, test account...). */
  tags?: string[];
  /** Moderation: blocks trading and/or hides the viewer from public rankings. */
  flags?: { noTrading?: boolean; hideFromBoard?: boolean; reason?: string; at?: number; /** The staff member who set them. */ by?: string };
}

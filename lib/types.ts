/** Card variants, lowest to highest. Upgrades only ever move one step up this ladder. */
export type Variant = 'regular' | 'reverse' | 'full' | 'shiny';

export type VariantWeights = Record<Variant, number>;

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
}

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
}

export interface UserProfile {
  username: string;       // lowercase, canonical key
  displayName: string;    // Twitch display name or custom label
  twitchId?: string;
  notes?: string;
  createdAt: number;
}

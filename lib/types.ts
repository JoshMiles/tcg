export interface Season {
  id: string;
  name: string;
  collectionName: string;
  active: boolean;
  createdAt: number;
  maxConcurrentPacks: number;
  packIds: string[];          // ordered list of pack IDs used by this season
}

export interface Pack {
  id: string;
  name: string;
  coverImageUrl: string;
  active: boolean;
  weight: number;             // relative draw weight when multiple packs are in a season
  accentColor: string;
  tearBorderColor: string;
  holoMinStars: number;
  cardTime: number;
  cooldownTime: number;
  soundVolume: number;
  createdAt: number;
}

export interface Card {
  id: string;
  number: number;
  name: string;
  imageUrl: string;
  soundUrl?: string;          // overrides the default assets/sounds/{number}.mp3
  probability: number;
  stars: number;              // 1–5
}

export interface PullRecord {
  cardId: string;
  cardNumber: number;
  cardName: string;
  stars: number;
  imageUrl: string;
  packId: string;
  packName: string;
  seasonId: string;
  seasonName: string;
  pulledAt: number;
}

export interface UserProfile {
  username: string;       // lowercase, canonical key
  displayName: string;    // Twitch display name or custom label
  twitchId?: string;
  notes?: string;
  createdAt: number;
}

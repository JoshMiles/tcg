export interface Season {
  id: string;
  name: string;
  active: boolean;
  createdAt: number;
}

export interface Pack {
  id: string;
  seasonId: string;
  name: string;
  coverImageUrl: string;
  active: boolean;
  weight: number;          // relative weight for random pack selection
  accentColor: string;
  tearBorderColor: string;
  holoMinStars: number;
  cardTime: number;
  cooldownTime: number;
  maxConcurrentPacks: number;
  soundVolume: number;
  createdAt: number;
}

export interface Card {
  id: string;
  number: number;
  name: string;
  imageUrl: string;
  probability: number;
  stars: number; // 1–5
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

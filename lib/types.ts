export interface Season {
  id: string;
  name: string;
  collectionName: string; // KV key suffix, no spaces
  coverImageUrl: string;
  active: boolean;
  createdAt: number;
  accentColor: string;
  tearBorderColor: string;
  holoMinStars: number;
  cardTime: number;       // seconds card stays visible
  cooldownTime: number;   // seconds between queued draws
}

export interface Card {
  id: string;
  number: number;
  name: string;
  imageUrl: string;
  probability: number;
  stars: number; // 1–5
}

export type Collection = Record<string, number[]>;

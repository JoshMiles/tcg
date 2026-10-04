import type { Season, Pack, Card } from './types';

export const SEED_SEASON: Season = {
  id: 'season1',
  name: 'Cheesy Starter Deck',
  collectionName: 'CheesyStarterDeck',
  active: true,
  createdAt: Date.now(),
  maxConcurrentPacks: 1,
  packIds: ['pack1'],
};

export const SEED_PACK: Pack = {
  id: 'pack1',
  name: 'Cheesy Starter Pack',
  coverImageUrl: '/assets/pack-cover.png',
  active: true,
  weight: 1,
  accentColor: 'rgb(241,187,6)',
  tearBorderColor: 'rgb(218,163,18)',
  holoMinStars: 5,
  cardTime: 3,
  cooldownTime: 1,
  soundVolume: 1.0,
  createdAt: Date.now(),
};

export const SEED_CARDS: Card[] = [
  { id: 'c1',  number: 1,  name: 'Cheesygidds',  imageUrl: '/assets/cards/Cheesygidds.webp',   soundUrl: '/assets/sounds/1.mp3',  probability: 3,  stars: 5 },
  { id: 'c2',  number: 2,  name: 'Dinogidds',    imageUrl: '/assets/cards/Dinogidds.webp',     soundUrl: '/assets/sounds/2.mp3',  probability: 4,  stars: 5 },
  { id: 'c3',  number: 3,  name: 'Onesiegidds',  imageUrl: '/assets/cards/Onesiegidds.webp',   soundUrl: '/assets/sounds/3.mp3',  probability: 5,  stars: 5 },
  { id: 'c4',  number: 4,  name: 'Creamygidds',  imageUrl: '/assets/cards/Creamygidds.webp',   soundUrl: '/assets/sounds/4.mp3',  probability: 7,  stars: 4 },
  { id: 'c5',  number: 5,  name: 'Wheezygidds',  imageUrl: '/assets/cards/Wheezygidds.webp',   soundUrl: '/assets/sounds/5.mp3',  probability: 9,  stars: 4 },
  { id: 'c6',  number: 6,  name: 'Suitygidds',   imageUrl: '/assets/cards/Suitygidds.webp',    soundUrl: '/assets/sounds/6.mp3',  probability: 7,  stars: 4 },
  { id: 'c7',  number: 7,  name: 'Cringygidds',  imageUrl: '/assets/cards/Cringygidds.webp',   soundUrl: '/assets/sounds/7.mp3',  probability: 7,  stars: 4 },
  { id: 'c8',  number: 8,  name: 'Mysterygidds', imageUrl: '/assets/cards/Mysterygidds.webp',  soundUrl: '/assets/sounds/8.mp3',  probability: 8,  stars: 4 },
  { id: 'c9',  number: 9,  name: 'Bottomygidds', imageUrl: '/assets/cards/Bottomgidds.webp',   soundUrl: '/assets/sounds/9.mp3',  probability: 15, stars: 3 },
  { id: 'c10', number: 10, name: 'Goatlygidds',  imageUrl: '/assets/cards/Goatlygidds.webp',   soundUrl: '/assets/sounds/10.mp3', probability: 25, stars: 3 },
  { id: 'c11', number: 11, name: 'Pokegidds',    imageUrl: '/assets/cards/PokegiddsV2.webp',   soundUrl: '/assets/sounds/11.mp3', probability: 25, stars: 3 },
  { id: 'c12', number: 12, name: 'UWUgidds',     imageUrl: '/assets/cards/UWUgidds.webp',      soundUrl: '/assets/sounds/12.mp3', probability: 11, stars: 3 },
  { id: 'c13', number: 13, name: 'Scaredygidds', imageUrl: '/assets/cards/Scaredygidds.webp',  soundUrl: '/assets/sounds/13.mp3', probability: 17, stars: 3 },
  { id: 'c14', number: 14, name: 'Angrygidds',   imageUrl: '/assets/cards/Angrygidds.webp',    soundUrl: '/assets/sounds/14.mp3', probability: 16, stars: 3 },
  { id: 'c15', number: 15, name: 'Sweatygidds',  imageUrl: '/assets/cards/Sweatygidds.webp',   soundUrl: '/assets/sounds/15.mp3', probability: 20, stars: 2 },
  { id: 'c16', number: 16, name: 'Comedygidds',  imageUrl: '/assets/cards/Comedygidds.webp',   soundUrl: '/assets/sounds/16.mp3', probability: 75, stars: 2 },
  { id: 'c17', number: 17, name: 'Glitchygidds', imageUrl: '/assets/cards/Glitchygidds.webp',  soundUrl: '/assets/sounds/17.mp3', probability: 60, stars: 2 },
  { id: 'c18', number: 18, name: 'Inkygidds',    imageUrl: '/assets/cards/Inkygidds.webp',     soundUrl: '/assets/sounds/18.mp3', probability: 50, stars: 2 },
  { id: 'c19', number: 19, name: 'Drinkygidds',  imageUrl: '/assets/cards/Drinkygidds.webp',   soundUrl: '/assets/sounds/19.mp3', probability: 53, stars: 2 },
  { id: 'c20', number: 20, name: 'Sillygidds',   imageUrl: '/assets/cards/Sillygidds.webp',    soundUrl: '/assets/sounds/20.mp3', probability: 67, stars: 2 },
  { id: 'c21', number: 21, name: 'Victorygidds', imageUrl: '/assets/cards/Victorygidds.webp',  soundUrl: '/assets/sounds/21.mp3', probability: 82, stars: 1 },
  { id: 'c22', number: 22, name: 'Gassygidds',   imageUrl: '/assets/cards/Gassygidds.webp',    soundUrl: '/assets/sounds/22.mp3', probability: 90, stars: 1 },
  { id: 'c23', number: 23, name: 'Crunchygidds', imageUrl: '/assets/cards/Cronchygidds.webp',  soundUrl: '/assets/sounds/23.mp3', probability: 87, stars: 1 },
  { id: 'c24', number: 24, name: 'Waxygidds',    imageUrl: '/assets/cards/Waxygidds.webp',     soundUrl: '/assets/sounds/24.mp3', probability: 71, stars: 1 },
  { id: 'c25', number: 25, name: 'Gaspygidds',   imageUrl: '/assets/cards/GaspygiddsV2.webp',  soundUrl: '/assets/sounds/25.mp3', probability: 84, stars: 1 },
];

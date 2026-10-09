// Discord feed settings types + constants. Browser-safe (no server imports) so the admin UI can use
// them; the server-side logic lives in ./discord.ts.

export type DiscordCategory = 'pulls' | 'cards' | 'stream' | 'resets';

export interface DiscordSettings {
  url: string;
  enabled: boolean;
  categories: Record<DiscordCategory, boolean>;
  minStars: number;     // pulls below this rarity are skipped
  newOnly: boolean;     // pulls: only announce cards the viewer didn't have yet
}

export const DEFAULT_DISCORD: DiscordSettings = {
  url: '',
  enabled: false,
  categories: { pulls: true, cards: true, stream: false, resets: true },
  minStars: 1,
  newOnly: false,
};

export const DISCORD_CATEGORIES: { key: DiscordCategory; label: string; hint: string }[] = [
  { key: 'pulls', label: 'Card pulls', hint: 'Every pack opened on stream' },
  { key: 'cards', label: 'Grants & removals', hint: 'Cards given or taken away by an admin or webhook' },
  { key: 'stream', label: 'Stream triggers', hint: 'Pack draws / collection views requested, and collections shown' },
  { key: 'resets', label: 'Resets & deletions', hint: 'Collections reset or users deleted' },
];

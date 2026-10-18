# lib/discord-config.ts

- FeedbackFilterKind · type · L5-L5 — type FeedbackFilterKind = 'idea' | 'bug' | 'deletion' | 'report';
- DiscordCategory · type · L15-L15 — type DiscordCategory = 'pulls' | 'cards' | 'upgrades' | 'trades' | 'listings' | 'recap' | 'digest' | 'feedback' | 'stream' | 'resets' | 'admin' | 'system';
- DiscordChannel · interface · L18-L30 — interface DiscordChannel
- DiscordLogEntry · interface · L33-L33 — interface DiscordLogEntry
- DiscordSettings · interface · L37-L41 — interface DiscordSettings
- newChannelId · function · L82-L84 — function newChannelId(): string
- presetChannel · function · L86-L89 — function presetChannel(key: string): DiscordChannel

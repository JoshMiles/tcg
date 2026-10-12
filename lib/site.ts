// Public base URL of the deployed site, used where we need absolute links (e.g. Discord messages).
// Override with the SITE_URL env var if the domain changes.
// The game only runs on this one Twitch channel (and the Twitch Extension is only installed there). Use these in copy.
export const CHANNEL_NAME = 'Cheesygidds';
export const CHANNEL_LOGIN = 'cheesygidds';
export const CHANNEL_URL = `https://www.twitch.tv/${CHANNEL_LOGIN}`;

export const SITE_URL = (process.env.SITE_URL ?? 'https://cheesytcg.app').replace(/\/$/, '');

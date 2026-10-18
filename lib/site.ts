// Public base URL of the deployed site, used where we need absolute links (e.g. Discord messages).
// Override with the SITE_URL env var if the domain changes.
// The game only runs on this one Twitch channel (and the Twitch Extension is only installed there). Use these in copy.
export const CHANNEL_NAME = 'Cheesygidds';
export const CHANNEL_LOGIN = 'cheesygidds';
export const CHANNEL_URL = `https://www.twitch.tv/${CHANNEL_LOGIN}`;

export const SITE_URL = (process.env.SITE_URL ?? 'https://cheesytcg.app').replace(/\/$/, '');

// Problem reports are GitHub issues on the public repo (no daily limit; a GitHub account is needed).
export const ISSUES_URL = 'https://github.com/JoshMiles/tcg/issues';
/** A prefilled new-issue link; `from` is the site path the problem was on. */
export const reportProblemUrl = (from?: string) =>
  `${ISSUES_URL}/new?${new URLSearchParams({ body: `Page: ${SITE_URL}${from || '/'}\n\nWhat happened?\n\n\nWhat did you expect?\n` })}`;

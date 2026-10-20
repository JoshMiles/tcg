// Public base URL of the deployed site, used where we need absolute links (e.g. Discord messages).
// Override with the SITE_URL env var if the domain changes.
// The game only runs on this one Twitch channel (and the Twitch Extension is only installed there). Use these in copy.
export const CHANNEL_NAME = 'Cheesygidds';
export const CHANNEL_LOGIN = 'cheesygidds';
export const CHANNEL_URL = `https://www.twitch.tv/${CHANNEL_LOGIN}`;

export const SITE_URL = (process.env.SITE_URL ?? 'https://cheesytcg.app').replace(/\/$/, '');

// Problem reports are GitHub issues on the public repo (no daily limit; a GitHub account is needed).
export const REPO_URL = 'https://github.com/JoshMiles/tcg';
export const ISSUES_URL = `${REPO_URL}/issues`;
/** A new-issue link on the bug report form with the steps started; `from` is the site path the problem was on. */
export const reportProblemUrl = (from?: string) =>
  `${ISSUES_URL}/new?${new URLSearchParams({ template: 'bug_report.yml', steps: `1. Go to ${SITE_URL}${from || '/'}\n2. ` })}`;
/** A new-issue link on the feature request form. */
export const featureRequestUrl = () => `${ISSUES_URL}/new?template=feature_request.yml`;

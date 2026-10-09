// Public base URL of the deployed site, used where we need absolute links (e.g. Discord messages).
// Override with the SITE_URL env var if the domain changes.
export const SITE_URL = (process.env.SITE_URL ?? 'https://tcg-khaki.vercel.app').replace(/\/$/, '');

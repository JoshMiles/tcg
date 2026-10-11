import { SITE_URL } from './site';

// Details shown in the Privacy Policy and Terms (EULA). Set these in the deployment's environment so the
// published documents name a real operator and a real way to get in touch — don't hard-code them here.
//   LEGAL_OPERATOR_NAME   who runs the extension (a person or business name), e.g. "Jane Doe"
//   LEGAL_CONTACT_EMAIL   where privacy / data requests go
//   LEGAL_GOVERNING_LAW   e.g. "the laws of England and Wales"
// Everything falls back to neutral wording when unset, so the pages always render.

export const LEGAL_UPDATED = '12 October 2026';

export const APP_NAME = 'The Cheesy TCG';

export const OPERATOR = process.env.LEGAL_OPERATOR_NAME?.trim() || 'the streamer who operates this extension';
export const CONTACT_EMAIL = process.env.LEGAL_CONTACT_EMAIL?.trim() || '';
export const GOVERNING_LAW = process.env.LEGAL_GOVERNING_LAW?.trim() || '';

export const PRIVACY_URL = `${SITE_URL}/privacy`;
export const TERMS_URL = `${SITE_URL}/terms`;

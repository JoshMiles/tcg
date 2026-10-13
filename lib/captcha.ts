// Cloudflare Turnstile on the website's trade and upgrade actions.
//
// The check is only asked for when needed: the first time a viewer trades or upgrades (and again after PASS_SECONDS of not
// doing so) the server answers "captcha required" and the page shows the widget, then retries with the token. A passed check
// is remembered for the viewer for a while so a run of upgrades is not interrupted. It switches itself off (fails open) when
// the keys are not set, inside sandboxes, and if Cloudflare cannot be reached, so it can never lock the game.
//
// TURNSTILE_SITE_KEY (public) and TURNSTILE_SECRET_KEY (private) come from the Cloudflare dashboard. The Twitch panel's
// trades and upgrades are signed by Twitch and do not use this.

export const PASS_SECONDS = 15 * 60;
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN = 2048;

export interface CaptchaKeys { site: string; secret: string }
export function captchaKeys(env: Record<string, string | undefined> = process.env): CaptchaKeys | null {
  const site = env.TURNSTILE_SITE_KEY?.trim();
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  return site && secret ? { site, secret } : null;
}

export type VerifyResult = 'valid' | 'invalid' | 'unreachable';

export interface CaptchaDeps {
  keys: CaptchaKeys | null;
  sandbox: boolean;
  hasPass(username: string): Promise<boolean>;
  grantPass(username: string): Promise<void>;
  verify(token: string, secret: string, ip?: string): Promise<VerifyResult>;
}

export type CaptchaOutcome =
  | { ok: true; via: 'off' | 'pass' | 'token' | 'unreachable' }
  | { ok: false; reason: 'required' | 'failed'; siteKey: string };

/** Decides whether a viewer may go ahead. Pure apart from the injected `deps`. */
export async function checkCaptcha(input: { username: string; token?: unknown; ip?: string }, deps: CaptchaDeps): Promise<CaptchaOutcome> {
  if (!deps.keys || deps.sandbox) return { ok: true, via: 'off' };
  if (await deps.hasPass(input.username)) return { ok: true, via: 'pass' };
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  if (!token || token.length > MAX_TOKEN) return { ok: false, reason: 'required', siteKey: deps.keys.site };
  const verdict = await deps.verify(token, deps.keys.secret, input.ip);
  if (verdict === 'invalid') return { ok: false, reason: 'failed', siteKey: deps.keys.site };
  if (verdict === 'valid') await deps.grantPass(input.username);
  return { ok: true, via: verdict === 'valid' ? 'token' : 'unreachable' };
}

/** Asks Cloudflare whether a token is genuine (each token works once). A network problem is "unreachable", not a failure. */
export async function verifyTurnstile(token: string, secret: string, ip?: string, fetchImpl: typeof fetch = fetch): Promise<VerifyResult> {
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set('remoteip', ip);
    const res = await fetchImpl(VERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return 'unreachable';
    const data = (await res.json()) as { success?: boolean };
    return data.success ? 'valid' : 'invalid';
  } catch {
    return 'unreachable';
  }
}

/** The message and shape the page looks for: `captcha: true` plus the public site key makes it show the check and retry. */
export function captchaBody(outcome: Extract<CaptchaOutcome, { ok: false }>) {
  return {
    error: outcome.reason === 'failed' ? 'The check did not pass. Please try again.' : 'Please complete the quick check to continue.',
    captcha: true as const,
    siteKey: outcome.siteKey,
  };
}

import { NextResponse } from 'next/server';
import { currentSandboxId, kv } from './db';
import { clientIp } from './login-limit';
import { PASS_SECONDS, captchaBody, captchaKeys, checkCaptcha, verifyTurnstile } from './captcha';

const passKey = (username: string) => `captcha:pass:${username.toLowerCase()}`;

/**
 * Gate for a trade or upgrade request: returns the error response to send when the viewer still has to pass the check, or
 * null to carry on. The token (if the page has one) is read from the request body's `captchaToken`.
 */
export async function captchaGate(req: Request, username: string, body: Record<string, unknown>): Promise<NextResponse | null> {
  const ip = clientIp(req.headers);
  const outcome = await checkCaptcha({ username, token: body.captchaToken, ip: ip === 'unknown' ? undefined : ip }, {
    keys: captchaKeys(),
    sandbox: !!(await currentSandboxId()),
    hasPass: async u => !!(await kv.get(passKey(u))),
    grantPass: async u => { await kv.set(passKey(u), 1, { ex: PASS_SECONDS }); },
    verify: (token, secret, ip) => verifyTurnstile(token, secret, ip),
  });
  return outcome.ok ? null : NextResponse.json(captchaBody(outcome), { status: 403 });
}

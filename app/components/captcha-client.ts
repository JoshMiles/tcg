// Browser side of the trade / upgrade check (see lib/captcha.ts). `postJson` is a plain POST that, when the server answers
// "captcha required", asks the page for a Turnstile token (a modal rendered by <CaptchaHost />) and sends the request again.

export interface CaptchaRequest {
  siteKey: string;
  /** True on the second ask: the first token was refused. */
  retry: boolean;
  /** Resolve with a token, or null if the viewer closed the check. */
  resolve: (token: string | null) => void;
}

const hosts = new Set<(r: CaptchaRequest) => void>();

/** The host component subscribes here while it is on the page. */
export function onCaptchaRequest(fn: (r: CaptchaRequest) => void): () => void {
  hosts.add(fn);
  return () => { hosts.delete(fn); };
}

function requestToken(siteKey: string, retry: boolean): Promise<string | null> {
  return new Promise(resolve => {
    if (hosts.size === 0) { resolve(null); return; }
    hosts.forEach(h => h({ siteKey, retry, resolve }));
  });
}

/** POSTs JSON; if the server wants the check, shows it and retries (up to twice). Returns the final response. */
export async function postJson(url: string, body: Record<string, unknown>): Promise<Response> {
  const res = await postJsonOnce(url, body);
  // A trade action can change what the bell shows (a counter, an accept): check at once instead of waiting for the next poll.
  if (url.startsWith('/api/trades') && typeof window !== 'undefined') window.dispatchEvent(new Event('tcg:notices-check'));
  return res;
}

async function postJsonOnce(url: string, body: Record<string, unknown>): Promise<Response> {
  const send = (extra?: Record<string, unknown>) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...extra }) });
  let res = await send();
  for (let attempt = 0; attempt < 2; attempt++) {
    if (res.status !== 403) return res;
    const data = await res.clone().json().catch(() => null) as { captcha?: boolean; siteKey?: unknown } | null;
    if (!data?.captcha || typeof data.siteKey !== 'string') return res;
    const token = await requestToken(data.siteKey, attempt > 0);
    if (!token) return res; // closed: the caller shows the "please complete the quick check" message
    res = await send({ captchaToken: token });
  }
  return res;
}

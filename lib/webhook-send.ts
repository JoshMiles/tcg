// The one way the server calls an address an admin typed (the outgoing pull webhook and Mix It Up). It checks the address as written
// (public host, https or a stored http one), resolves a DNS name and refuses it if ANY answer is private, and never follows a redirect,
// so a public name cannot bounce the request to a private one. Node runtime only (node:dns). ROADMAP 47.10.
import { lookup } from 'node:dns/promises';
import { checkWebhookSendUrl, isPrivateHost } from './webhook-clean';

/** The DNS lookup, as an object so a check can swap it. */
export const webhookDns = { lookup: (host: string) => lookup(host, { all: true }) };

export type SendResult = { ok: true; res: Response } | { ok: false; error: string };

const isIpLiteral = (host: string) => /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':');

/**
 * POSTs (or whatever `init` says) to `raw` and returns the response, or a plain-words error. Never throws.
 * `doFetch` is a test seam: when a caller passes its own fetch, the DNS lookup is skipped (there is no real network to protect).
 * shortcut: DNS can change between the lookup and the fetch (rebinding); pinning the resolved IP is not done, upgrade if an untrusted party can set the address.
 */
export async function sendWebhook(raw: string, init: RequestInit, doFetch?: typeof fetch): Promise<SendResult> {
  const target = checkWebhookSendUrl(raw);
  if (!target.ok) return target;
  if (!target.url) return { ok: false, error: 'No address set.' };
  const host = new URL(target.url).hostname.replace(/^\[|\]$/g, '');
  if (!doFetch && !isIpLiteral(host)) {
    let addrs: { address: string }[];
    try { addrs = await webhookDns.lookup(host); } catch { return { ok: false, error: 'Could not look up the address.' }; }
    if (!addrs.length) return { ok: false, error: 'Could not look up the address.' };
    if (addrs.some(a => isPrivateHost(a.address))) return { ok: false, error: 'The address resolves to a private network.' };
  }
  try {
    const res = await (doFetch ?? fetch)(target.url, { ...init, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) return { ok: false, error: 'The address redirected; webhooks do not follow redirects.' };
    return { ok: true, res };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No answer.' };
  }
}

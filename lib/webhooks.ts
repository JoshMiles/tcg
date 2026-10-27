import { kv, inSandbox } from './db';
import type { Variant } from './types';
import { randomBytes, timingSafeEqual } from 'crypto';
import { cleanWebhookFields } from './webhook-clean';
import { sendWebhook } from './webhook-send';
import { cleanLogin } from './staff-core';
import { limitWebhook } from './rate-limit';
import { noteSecretUsed } from './secret-used';
import { noteIncoming } from './mixitup-health';
import { NextResponse } from 'next/server';

// ── Types ─────────────────────────────────────────────────

export interface WebhookField {
  key: string;
  value: string;  // may contain {username}, {cardName}, etc.
}

export interface OutgoingWebhookConfig {
  url: string;
  enabled: boolean;
  fields: WebhookField[];
}

export interface WebhookSettings {
  incomingSecret: string;
  outgoing: {
    cardPulled: OutgoingWebhookConfig;
    collectionShown: OutgoingWebhookConfig;
  };
}

export interface QueuedEvent {
  id: string;
  type: 'pull' | 'collection' | 'card';
  username: string;
  queuedAt: number;
  /** For `pull`: what the server rolled (lib/draw.ts). The overlay plays exactly this and saves it with `id` as the ticket. */
  draw?: { packId: string; cardNumber: number; variant: Variant };
  /** A paid pull (Mix It Up): the same id is the payment reservation, charged when the card is saved. */
  paid?: boolean;
  /** For `card` (show a card off): which card and version, and the serial of the viewer's copy. Already checked against their collection. */
  cardNumber?: number;
  variant?: Variant;
  serial?: number;
  serialMult?: number;
  /** The edition number of that copy. */
  uid?: number;
}

// ── KV helpers ────────────────────────────────────────────

export async function getWebhookSettings(): Promise<WebhookSettings> {
  const stored = await kv.get<WebhookSettings>('webhooks:settings');
  if (stored) return stored;
  // First access, auto-generate a secret
  const fresh: WebhookSettings = {
    incomingSecret: randomBytes(16).toString('hex'),
    outgoing: {
      cardPulled:      { url: '', enabled: false, fields: [] },
      collectionShown: { url: '', enabled: false, fields: [] },
    },
  };
  await kv.set('webhooks:settings', fresh);
  return fresh;
}

export async function saveWebhookSettings(settings: WebhookSettings): Promise<void> {
  await kv.set('webhooks:settings', settings);
}

// ── Event queue (incoming → widget) ──────────────────────

export async function enqueueEvent(event: QueuedEvent): Promise<void> {
  await kv.lpush('webhooks:queue', event);
  await kv.ltrim('webhooks:queue', 0, 49); // cap at 50 unprocessed events
}

export async function dequeueEvent(): Promise<QueuedEvent | null> {
  return kv.rpop<QueuedEvent>('webhooks:queue');
}

// ── Outgoing webhook firing ───────────────────────────────

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export type OutgoingEvent = 'cardPulled' | 'collectionShown';
export interface WebhookFailure { at: number; error: string }

/** The last failed send per event, for Settings (a success does not clear it; the time shows how old it is). */
export async function getWebhookFailures(): Promise<Record<OutgoingEvent, WebhookFailure | null>> {
  const [cardPulled, collectionShown] = await Promise.all((['cardPulled', 'collectionShown'] as const).map(e => kv.get<WebhookFailure>(`webhooks:failure:${e}`).catch(() => null)));
  return { cardPulled: cardPulled ?? null, collectionShown: collectionShown ?? null };
}

export async function fireOutgoing(
  config: OutgoingWebhookConfig,
  vars: Record<string, string>,
  event?: OutgoingEvent,
): Promise<void> {
  if (!config.enabled || !config.url) return;
  if (await inSandbox()) return; // sandboxes never call outside services
  const payload = Object.fromEntries(
    cleanWebhookFields(config.fields).map(f => [f.key, interpolate(f.value, vars)])
  );
  // Awaited, so a caller can hold it open with after() (a bare fetch is dropped when the function is frozen). Never throws.
  // Whatever was stored, only a public address is called, resolved first and never redirected (lib/webhook-send.ts).
  const sent = await sendWebhook(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });
  if (!sent.ok && event) await kv.set(`webhooks:failure:${event}`, { at: Date.now(), error: sent.error } satisfies WebhookFailure).catch(() => {});
}

// ── Incoming webhook auth ─────────────────────────────────

export type IncomingWebhook =
  | { ok: true; username: string; body: Record<string, unknown> }
  | { ok: false; response: NextResponse };

/** Compares two secrets in constant time (a plain `===` leaks how many leading characters matched). */
function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Whether a body's `secret` is the incoming webhook secret. */
export async function incomingSecretValid(secret: unknown, route: string): Promise<boolean> {
  const ok = typeof secret === 'string' && sameSecret(secret, (await getWebhookSettings()).incomingSecret);
  if (ok) noteSecretUsed('INCOMING_WEBHOOK_SECRET', route);
  if (ok) void noteIncoming(route, 'ok');
  else if (typeof secret === 'string' && secret) void noteIncoming(route, 'bad');
  return ok;
}

/** Validates the shared secret and normalizes `username` for MixItUp-style incoming webhooks. */
export async function parseIncomingWebhook(req: Request): Promise<IncomingWebhook> {
  const limited = await limitWebhook(req);
  if (limited) return { ok: false, response: limited };
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!(await incomingSecretValid(body.secret, new URL(req.url).pathname))) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid secret', message: 'Invalid secret' }, { status: 401 }) };
  }
  // A Twitch login (3 to 25 letters, digits and underscores, an @ in front is dropped); anything else is not a viewer.
  const username = cleanLogin(body.username);
  if (!username) {
    return { ok: false, response: NextResponse.json({ error: 'username must be a Twitch login (3 to 25 letters, digits or underscores)', message: 'That is not a Twitch name.' }, { status: 400 }) };
  }
  return { ok: true, username, body };
}

/** Number of events waiting for an overlay to pick up. */
export async function queueLength(): Promise<number> {
  return kv.llen('webhooks:queue');
}

/** What is waiting, the one the overlay takes next first. */
export async function peekQueue(): Promise<QueuedEvent[]> {
  return (await kv.lrange<QueuedEvent>('webhooks:queue', 0, -1)).reverse();
}

/** Drops everything waiting in the queue; returns how many events were discarded. */
export async function clearQueue(): Promise<number> {
  const n = await queueLength();
  if (n > 0) await kv.del('webhooks:queue');
  return n;
}

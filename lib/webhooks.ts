import { kv, inSandbox } from './db';
import type { Variant } from './types';
import { randomBytes, timingSafeEqual } from 'crypto';
import { checkWebhookUrl, cleanWebhookFields } from './webhook-clean';
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

export async function fireOutgoing(
  config: OutgoingWebhookConfig,
  vars: Record<string, string>,
): Promise<void> {
  if (!config.enabled || !config.url) return;
  if (await inSandbox()) return; // sandboxes never call outside services
  // Whatever was stored, only ever call a public http(s) address (the settings form checks this too).
  const target = checkWebhookUrl(config.url);
  if (!target.ok || !target.url) return;
  const payload = Object.fromEntries(
    cleanWebhookFields(config.fields).map(f => [f.key, interpolate(f.value, vars)])
  );
  fetch(target.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {}); // fire-and-forget
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

/** Validates the shared secret and normalizes `username` for MixItUp-style incoming webhooks. */
export async function parseIncomingWebhook(req: Request): Promise<IncomingWebhook> {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const settings = await getWebhookSettings();
  if (typeof body.secret !== 'string' || !sameSecret(body.secret, settings.incomingSecret)) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid secret' }, { status: 401 }) };
  }
  const username = typeof body.username === 'string' ? body.username.toLowerCase().trim() : '';
  if (!username) {
    return { ok: false, response: NextResponse.json({ error: 'username required' }, { status: 400 }) };
  }
  return { ok: true, username, body };
}

/** Number of events waiting for an overlay to pick up. */
export async function queueLength(): Promise<number> {
  return kv.llen('webhooks:queue');
}

/** Drops everything waiting in the queue; returns how many events were discarded. */
export async function clearQueue(): Promise<number> {
  const n = await queueLength();
  if (n > 0) await kv.del('webhooks:queue');
  return n;
}

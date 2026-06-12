import { kv } from '@vercel/kv';
import { randomBytes } from 'crypto';

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
  type: 'pull' | 'collection';
  username: string;
  queuedAt: number;
}

// ── KV helpers ────────────────────────────────────────────

export async function getWebhookSettings(): Promise<WebhookSettings> {
  const stored = await kv.get<WebhookSettings>('webhooks:settings');
  if (stored) return stored;
  // First access — auto-generate a secret
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
  const payload = Object.fromEntries(
    config.fields.map(f => [f.key, interpolate(f.value, vars)])
  );
  fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {}); // fire-and-forget
}

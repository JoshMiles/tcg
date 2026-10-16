import webpush from 'web-push';
import { after } from 'next/server';
import { createHash } from 'node:crypto';
import { kv, inSandbox } from './db';
import { getUserSettings } from './user-settings-store';
import { wantsNotice } from './user-settings';
import {
  PUSH_MAX_DEVICES, allowsPush, deviceLabel, parseSubscription, payloadFor,
  type PushDevice, type PushDeviceInfo, type PushPayload,
} from './push-core';
import type { Notice } from './trade-notice-core';

// Web Push: the only file that imports `web-push` (Node runtime; never from client code or the edge middleware). Browsers bring
// their own push service, we only sign the message with the VAPID keys. Without the keys everything here is a quiet no-op.
// Devices live in the KV hash push:<user> (field = hash of the endpoint), at most PUSH_MAX_DEVICES per viewer.

const TTL_S = 24 * 60 * 60;
const key = (u: string) => `push:${u.toLowerCase()}`;
const idOf = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex').slice(0, 20);

export const pushPublicKey = () => (process.env.VAPID_PUBLIC_KEY ?? '').trim();
export const pushConfigured = () => !!(pushPublicKey() && (process.env.VAPID_PRIVATE_KEY ?? '').trim());

function vapid() {
  return {
    subject: (process.env.VAPID_SUBJECT ?? '').trim() || 'mailto:admin@example.com',
    publicKey: pushPublicKey(),
    privateKey: (process.env.VAPID_PRIVATE_KEY ?? '').trim(),
  };
}

async function readAll(user: string): Promise<Record<string, PushDevice>> {
  return ((await kv.hgetall(key(user)).catch(() => null)) as Record<string, PushDevice> | null) ?? {};
}

export async function listDevices(user: string): Promise<PushDeviceInfo[]> {
  const all = await readAll(user);
  return Object.entries(all).map(([id, d]) => ({ id, ua: d.ua, addedAt: d.addedAt, lastOkAt: d.lastOkAt })).sort((a, b) => b.addedAt - a.addedAt);
}

export type SubscribeResult = { ok: true; id: string; devices: PushDeviceInfo[] } | { ok: false; error: string };

/** Stores (or refreshes) this device. A sixth device drops the oldest. */
export async function addDevice(user: string, input: unknown, ua: string): Promise<SubscribeResult> {
  if (!pushConfigured()) return { ok: false, error: 'Alerts are not set up on this site yet.' };
  const sub = parseSubscription(input);
  if (!sub) return { ok: false, error: 'That does not look like a valid push subscription.' };
  const id = idOf(sub.endpoint);
  const all = await readAll(user);
  const now = Date.now();
  const device: PushDevice = { ...sub, ua: deviceLabel(ua), addedAt: all[id]?.addedAt ?? now, lastOkAt: now };
  const others = Object.entries(all).filter(([k]) => k !== id).sort((a, b) => a[1].addedAt - b[1].addedAt);
  const drop = others.slice(0, Math.max(0, others.length + 1 - PUSH_MAX_DEVICES)).map(([k]) => k);
  if (drop.length) await kv.hdel(key(user), ...drop);
  await kv.hset(key(user), { [id]: device });
  return { ok: true, id, devices: await listDevices(user) };
}

/** Removes a device by endpoint (this browser) or by id (from the list). */
export async function removeDevice(user: string, ref: { endpoint?: unknown; id?: unknown }): Promise<PushDeviceInfo[]> {
  const id = typeof ref.id === 'string' && /^[a-f0-9]{20}$/.test(ref.id) ? ref.id : typeof ref.endpoint === 'string' ? idOf(ref.endpoint) : null;
  if (id) await kv.hdel(key(user), id).catch(() => 0);
  return listDevices(user);
}

export async function deleteAllDevices(user: string): Promise<void> {
  await kv.del(key(user)).catch(() => 0);
}

export interface PushResult { sent: number; removed: number; failed: number }

/** Sends one payload to every device of a viewer. A 404 / 410 from the push service removes that device; other failures are logged. */
export async function pushToUser(user: string, payload: PushPayload): Promise<PushResult> {
  const res: PushResult = { sent: 0, removed: 0, failed: 0 };
  if (!pushConfigured()) return res;
  const all = await readAll(user);
  const v = vapid();
  const body = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url, tag: payload.tag });
  await Promise.all(Object.entries(all).map(async ([id, d]) => {
    try {
      // Signed here, delivered with fetch (web-push's own sender only speaks https, which a local fake endpoint cannot).
      const details = webpush.generateRequestDetails(
        { endpoint: d.endpoint, keys: d.keys }, body,
        { TTL: TTL_S, urgency: payload.urgent ? 'high' : 'normal', vapidDetails: v } as webpush.RequestOptions,
      );
      const r = await fetch(details.endpoint, { method: details.method, headers: details.headers as Record<string, string>, body: details.body as unknown as BodyInit, signal: AbortSignal.timeout(8000) });
      if (r.status === 404 || r.status === 410) { await kv.hdel(key(user), id); res.removed++; }
      else if (r.ok) { res.sent++; await kv.hset(key(user), { [id]: { ...d, lastOkAt: Date.now() } }).catch(() => 0); }
      else { res.failed++; console.warn(`push for ${user}: push service answered ${r.status}`); }
    } catch (e) {
      res.failed++;
      console.warn('push failed:', e instanceof Error ? e.message : e);
    }
  }));
  return res;
}

/** The "Send me a test alert" button (nothing is sent from a sandbox or preview). */
export async function sendTestPush(user: string): Promise<PushResult> {
  if (await inSandbox()) return { sent: 0, removed: 0, failed: 0 };
  return pushToUser(user, { title: 'Test alert', body: 'Alerts work on this device. You will get one when someone trades with you.', url: '/settings', tag: 'test' });
}

/**
 * Called by notify() once the notice is written. The sandbox is decided now (it is not visible inside after()); the send runs after
 * the response so a slow push service never slows a trade. Outside a request (scripts, checks) it just runs.
 */
export async function pushNotice(user: string, notice: Notice): Promise<void> {
  try {
    if (!pushConfigured() || (await inSandbox())) return;
    const s = await getUserSettings(user);
    if (!wantsNotice(s, notice.kind) || !allowsPush(s.pushKinds, notice.kind)) return;
    const run = async () => { await pushToUser(user, payloadFor(notice)); };
    try { after(run); } catch { await run(); }
  } catch { /* best effort */ }
}

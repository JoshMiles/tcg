// Browser side of Web Push (client only): is it possible here, and subscribe / unsubscribe this device. The server half is lib/push.ts.

export type PushSupport = 'ok' | 'install-first' | 'unsupported';

/** An iPhone / iPad only allows push inside the installed app (iOS 16.4+); a normal Safari tab cannot ask. */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'install-first';
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window ? 'ok' : 'unsupported';
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  try { return await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { return null; }
}

/** Asks permission (must run from a tap), subscribes and tells the server. Throws a viewer-readable message ('denied' when blocked). */
export async function enablePush(publicKey: string): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'denied' : 'Alerts were not allowed.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const res = await fetch('/api/account/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Could not turn alerts on.');
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch('/api/account/push', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => null);
  await sub.unsubscribe().catch(() => false);
}

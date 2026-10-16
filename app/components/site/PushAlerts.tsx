'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { PUSH_KINDS, PUSH_KIND_LABELS, type PushDeviceInfo, type PushKind } from '@/lib/push-core';
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from '@/lib/push-client';

interface Info { enabled: boolean; publicKey?: string; devices: PushDeviceInfo[] }

const when = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Settings, Notifications: turn alerts on for this device, choose which kinds, send a test, list and remove devices. Hidden until the server has VAPID keys. */
export function PushAlerts({ kinds, onKinds }: { kinds: PushKind[]; onKinds: (k: PushKind[]) => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [support, setSupport] = useState<PushSupport>('unsupported');
  const [perm, setPerm] = useState<NotificationPermission>('default');
  const [here, setHere] = useState<string | null>(null); // this browser's endpoint, when it is subscribed
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch('/api/account/push', { cache: 'no-store' }).catch(() => null);
    if (r?.ok) setInfo(await r.json());
    setHere((await currentSubscription())?.endpoint ?? null);
  }, []);

  useEffect(() => {
    setSupport(pushSupport());
    if ('Notification' in window) setPerm(Notification.permission);
    void refresh();
  }, [refresh]);

  if (!info?.enabled) return null;
  const on = here !== null && perm === 'granted';

  async function act(fn: () => Promise<string | void>) {
    setBusy(true); setMsg(null);
    try { const m = await fn(); if (m) setMsg(m); }
    catch (e) { setMsg(e instanceof Error && e.message !== 'denied' ? e.message : null); }
    if ('Notification' in window) setPerm(Notification.permission);
    await refresh();
    setBusy(false);
  }
  const turnOn = () => act(() => enablePush(info!.publicKey!));
  const turnOff = () => act(disablePush);
  const test = () => act(async () => {
    const r = await fetch('/api/account/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ test: true }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error || 'Could not send the test.');
    return b.sent > 0 ? 'Sent. It should show up in a moment.' : 'Nothing was sent. Turn alerts on for this device first.';
  });
  const remove = (id: string) => act(async () => {
    await fetch('/api/account/push', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
  });
  const toggle = (k: PushKind) => onKinds(kinds.includes(k) ? kinds.filter(x => x !== k) : PUSH_KINDS.filter(x => x === k || kinds.includes(x)));

  return (
    <div id="push" className="py-3 space-y-3 border-t border-gray-800">
      <div>
        <p className="text-sm font-semibold text-gray-100">Alerts on this device</p>
        <p className="text-xs text-gray-500">Get an alert on your phone or computer when something happens, even with the site closed.</p>
      </div>
      {support === 'install-first' && (
        <p className="text-sm text-gray-300">Install the app first, then come back here to turn alerts on. <Link href="/install" className="font-semibold text-yellow-400 hover:text-yellow-300">Install the app</Link></p>
      )}
      {support === 'unsupported' && <p className="text-sm text-gray-400">This browser cannot show alerts.</p>}
      {support === 'ok' && perm === 'denied' && (
        <p className="text-sm text-gray-300">Alerts are blocked for this site. Allow notifications for it in your browser or phone settings (usually the padlock next to the address, then Notifications), then reload this page.</p>
      )}
      {support === 'ok' && perm !== 'denied' && (
        <div className="flex flex-wrap gap-2">
          {on
            ? <button type="button" disabled={busy} onClick={turnOff} className="rounded-xl border border-gray-700 px-3 py-1.5 text-sm font-semibold text-gray-200 hover:text-white disabled:opacity-50">Turn off for this device</button>
            : <button type="button" disabled={busy} onClick={turnOn} className="rounded-xl bg-yellow-500 hover:bg-yellow-400 px-3 py-1.5 text-sm font-bold text-gray-950 disabled:opacity-50"><Icon name="bell" className="mr-1" />Turn on alerts for this device</button>}
          {info.devices.length > 0 && <button type="button" disabled={busy} onClick={test} className="rounded-xl border border-gray-700 px-3 py-1.5 text-sm font-semibold text-gray-200 hover:text-white disabled:opacity-50">Send me a test alert</button>}
        </div>
      )}
      {msg && <p role="status" className="text-xs text-yellow-300">{msg}</p>}
      <fieldset className="space-y-1">
        <legend className="text-xs text-gray-500 mb-1">Send an alert for (saved with the Save button below)</legend>
        {PUSH_KINDS.map(k => (
          <label key={k} className="flex items-center gap-2 text-sm text-gray-200">
            <input type="checkbox" checked={kinds.includes(k)} onChange={() => toggle(k)} className="accent-yellow-500" />{PUSH_KIND_LABELS[k]}
          </label>
        ))}
        <p className="text-xs text-gray-600">An alert is only sent when the matching bell notice above is on, too.</p>
      </fieldset>
      {info.devices.length > 0 && (
        <ul className="space-y-1.5">
          {info.devices.map(d => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-950 border border-gray-800 px-3 py-1.5 text-sm">
              <span className="min-w-0 text-gray-200">{d.ua}<span className="text-xs text-gray-500"> · added {when(d.addedAt)}</span></span>
              <button type="button" disabled={busy} onClick={() => remove(d.id)} className="shrink-0 text-xs font-semibold text-red-300 hover:text-red-200 disabled:opacity-50">Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

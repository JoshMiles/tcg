'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { PUSH_KIND_LABELS } from '@/lib/push-core';
import { EMAIL_KINDS, type EmailKind, type EmailOff, type EmailStatus } from '@/lib/email-core';

interface View { address: string; status: EmailStatus; off: EmailOff | null; kinds: EmailKind[] }

const OFF_TEXT: Record<EmailOff, string> = {
  unsubscribed: 'You unsubscribed.',
  bounced: 'The last email to this address bounced.',
  complained: 'An email to this address was reported as spam.',
};

/** Settings, Notifications: add an address, confirm it from the email we send, choose the kinds, remove it. Hidden until the server has RESEND_API_KEY. */
export function EmailAlerts() {
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState<View | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/account/email', { cache: 'no-store' }).catch(() => null);
    if (!r?.ok) return;
    const b = await r.json();
    setEnabled(!!b.enabled); setEmail(b.email);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!enabled) return null;

  async function send(method: 'POST' | 'DELETE', body: object, ok?: string) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/account/email', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(b.error || 'Could not save. Try again.');
      else { setEmail(b.email); if (ok) setMsg(ok); }
      return r.ok;
    } finally { setBusy(false); }
  }
  const start = async (address: string) => {
    if (await send('POST', { address }, 'Check your inbox for the confirmation link. Nothing else is sent until you open it.')) setDraft('');
  };
  const toggle = (k: EmailKind) => {
    if (!email) return;
    const kinds = email.kinds.includes(k) ? email.kinds.filter(x => x !== k) : EMAIL_KINDS.filter(x => x === k || email.kinds.includes(x));
    void send('POST', { kinds });
  };

  return (
    <div id="email" className="py-3 space-y-3 border-t border-gray-800">
      <div>
        <p className="text-sm font-semibold text-gray-100">Email</p>
        <p className="text-xs text-gray-500">Get your notices by email too. At most one email every 15 minutes: anything in between is sent together. Your address is never shown to other collectors.</p>
      </div>
      {email && (
        <div className="rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-sm text-gray-200 flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0"><Icon name="inbox" className="mr-1.5 text-gray-500" />{email.address}
            <span className="text-xs text-gray-500"> · {email.status === 'on' ? 'confirmed' : email.status === 'pending' ? 'waiting for you to confirm it' : `off. ${email.off ? OFF_TEXT[email.off] : ''}`}</span>
          </span>
          <span className="flex gap-3">
            {email.status !== 'on' && <button type="button" disabled={busy} onClick={() => send('POST', { resend: true }, 'Sent. Check your inbox.')} className="text-xs font-semibold text-yellow-400 hover:text-yellow-300 disabled:opacity-50">{email.status === 'off' ? 'Turn on again' : 'Send it again'}</button>}
            <button type="button" disabled={busy} onClick={() => send('DELETE', {}, 'Your address was removed.')} className="text-xs font-semibold text-red-300 hover:text-red-200 disabled:opacity-50">Remove</button>
          </span>
        </div>
      )}
      <form onSubmit={e => { e.preventDefault(); void start(draft); }} className="flex flex-wrap gap-2">
        <input type="email" inputMode="email" autoComplete="email" value={draft} onChange={e => setDraft(e.target.value)} placeholder={email ? 'Use a different address' : 'you@example.com'} aria-label="Email address" maxLength={254}
          className="min-w-0 flex-1 basis-56 rounded-xl bg-gray-950 border border-gray-700 focus:border-yellow-500 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none" />
        <button type="submit" disabled={busy || !draft.trim()} className="rounded-xl bg-yellow-500 hover:bg-yellow-400 px-3 py-1.5 text-sm font-bold text-gray-950 disabled:opacity-50">Send confirmation</button>
      </form>
      {msg && <p role="status" className="text-xs text-yellow-300">{msg}</p>}
      {email && (
        <fieldset className="space-y-1" disabled={busy}>
          <legend className="text-xs text-gray-500 mb-1">Email me for (saved at once)</legend>
          {EMAIL_KINDS.map(k => (
            <label key={k} className="flex items-center gap-2 text-sm text-gray-200">
              <input type="checkbox" checked={email.kinds.includes(k)} onChange={() => toggle(k)} className="accent-yellow-500" />{PUSH_KIND_LABELS[k]}
            </label>
          ))}
          <p className="text-xs text-gray-600">An email is only sent when the matching bell notice above is on, too.</p>
        </fieldset>
      )}
    </div>
  );
}

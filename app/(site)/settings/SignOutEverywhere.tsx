'use client';
import { useState } from 'react';
import { Icon } from '@/app/components/Icon';

/** Settings: end every login of this account (other devices and this one), after a confirm step. */
export function SignOutEverywhere() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/account/sign-out-everywhere', { method: 'POST' });
      if (res.ok) { window.location.assign('/'); return; }
      setError('Could not sign you out. Try again.');
    } catch { setError('Could not reach the site. Check your connection and try again.'); }
    setBusy(false);
  }

  return (
    <section id="sign-out-everywhere" className="scroll-mt-20 card rounded-2xl p-5 space-y-3" aria-labelledby="sign-out-everywhere-h">
      <h2 id="sign-out-everywhere-h" className="font-display text-xl font-bold text-white"><Icon name="logout" className="mr-2 text-yellow-400" />Sign out everywhere</h2>
      <p className="text-sm text-gray-400">Ends every login of this account on every device, including this one. Use it if you signed in on a shared or lost device. You can sign in again with Twitch any time.</p>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={run} disabled={busy} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-40">{busy ? 'Signing out...' : 'Yes, sign out everywhere'}</button>
          <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="rounded-xl border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-gray-400 disabled:opacity-60">Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="rounded-xl border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-gray-400">Sign out everywhere</button>
      )}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </section>
  );
}

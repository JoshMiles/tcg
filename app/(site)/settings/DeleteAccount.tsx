'use client';
import { useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { postJson } from '@/app/components/captcha-client';

export interface DeletionState { status: 'new' | 'done' | 'wontfix' | 'planned' | 'duplicate'; at: number; reply?: string }

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The bottom of Settings: ask for the account to be deleted. An admin does the deleting; the request is shown here until it is handled. */
export function DeleteAccount({ username, initial }: { username: string; initial: DeletionState | null }) {
  const [state, setState] = useState<DeletionState | null>(initial);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = state?.status === 'new';

  async function request(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await postJson('/api/account/deletion', { confirm: typed });
      const data = await res.json().catch(() => ({})) as { error?: string; captcha?: boolean; at?: number };
      if (res.ok) { setState({ status: 'new', at: data.at ?? Date.now() }); setTyped(''); return; }
      setError(data.captcha ? 'Please complete the quick check and try again.' : data.error || 'Could not send that. Try again.');
    } catch { setError('Could not reach the site. Check your connection and try again.'); } finally { setBusy(false); }
  }

  async function cancel() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/account/deletion', { method: 'DELETE' });
      if (res.ok) setState(null); else setError('Could not cancel that. Try again.');
    } catch { setError('Could not reach the site. Check your connection and try again.'); } finally { setBusy(false); }
  }

  return (
    <section id="delete-account-section" className="scroll-mt-20 rounded-2xl border border-red-500/30 bg-red-950/10 p-5 space-y-4" aria-labelledby="delete-account">
      <h2 id="delete-account" className="font-display text-xl font-bold text-white"><Icon name="trash" className="mr-2 text-red-400" />Delete my account</h2>
      <div className="text-sm text-gray-300 space-y-2 leading-relaxed">
        <p>If you ask, the team deletes your account and everything stored about it:</p>
        <ul className="list-disc pl-5 space-y-1 text-gray-400">
          <li>your collection, settings, notices and alert devices are removed;</li>
          <li>the prints you hold are retired, and show as &ldquo;a removed collector&rdquo; in their history;</li>
          <li>your open trade offers are cancelled;</li>
          <li>it cannot be undone (we keep a restore point for 14 days only so a mistake can be fixed).</li>
        </ul>
      </div>

      {pending ? (
        <div className="space-y-2" role="status">
          <p className="text-sm text-amber-200">Requested on {dateFmt.format(state!.at)}. The team will delete your account; this normally takes up to a month.</p>
          <button type="button" onClick={cancel} disabled={busy} className="rounded-xl border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-gray-400 disabled:opacity-60">Cancel request</button>
        </div>
      ) : (
        <>
          {state?.status === 'wontfix' && (
            <p className="rounded-xl border border-gray-700 bg-gray-900/60 px-3 py-2 text-sm text-gray-300" role="status">Your last request was declined{state.reply ? `: ${state.reply}` : '.'} You can ask again below.</p>
          )}
          <form onSubmit={request} className="space-y-3">
            <label className="block space-y-1 text-sm text-gray-300">
              <span>Type your login name (<span className="font-mono text-white">{username}</span>) to confirm</span>
              <input value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Type your login name to confirm" className="input input-sm w-full max-w-xs" />
            </label>
            <button type="submit" disabled={busy || typed.trim().replace(/^@/, '').toLowerCase() !== username.toLowerCase()} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-40">Request deletion</button>
          </form>
        </>
      )}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </section>
  );
}

'use client';
import { useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { postJson } from '@/app/components/captcha-client';
import { FEEDBACK_LIMITS } from '@/lib/feedback-core';

const field = 'w-full rounded-xl border border-gray-700 bg-gray-950/70 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-yellow-500 focus:outline-none';

// Suggestions only: problem reports go to GitHub issues (reportProblemUrl in lib/site.ts).
export function FeedbackForm({ left }: { left: number }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await postJson('/api/feedback', { kind: 'idea', title, body });
      const data = await res.json().catch(() => ({})) as { error?: string; captcha?: boolean };
      if (res.ok) { setSent(true); setTitle(''); setBody(''); return; }
      setError(data.captcha ? 'Please complete the quick check and send again.' : data.error || 'Could not send that. Try again.');
    } catch {
      setError('Could not reach the site. Check your connection and try again.');
    } finally { setBusy(false); }
  }

  if (sent) {
    return (
      <div className="tcg-panel rounded-2xl p-6 space-y-3 text-center" role="status">
        <Icon name="check" className="w-8 h-8 text-green-400 mx-auto" />
        <p className="font-display text-xl font-bold text-white">Thank you, that is sent</p>
        <p className="text-sm text-gray-400">The team reads everything. If we answer, you will get a notice in the bell.</p>
        <button type="button" onClick={() => setSent(false)} className="tcg-btn px-4 py-2 text-sm rounded-xl">Send another</button>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="tcg-panel rounded-2xl p-5 space-y-4">
      <label className="block space-y-1">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Title</span>
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={FEEDBACK_LIMITS.title} required className={field} placeholder="A short name for your idea" />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Details</span>
        <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={FEEDBACK_LIMITS.body} required rows={6} className={field} placeholder="What would you like, and why would it help?" />
      </label>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="tcg-btn px-5 py-2 text-sm rounded-xl disabled:opacity-60">{busy ? 'Sending…' : 'Send'}</button>
        <span className="text-xs text-gray-500">{left} of {FEEDBACK_LIMITS.perDay} sends left today</span>
      </div>
    </form>
  );
}

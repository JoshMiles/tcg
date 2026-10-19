'use client';
import { useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { postJson } from '@/app/components/captcha-client';
import { FEEDBACK_LIMITS } from '@/lib/feedback-core';

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
      <div className="card items-center rounded-2xl p-6 space-y-3 text-center" role="status">
        <Icon name="check" className="w-8 h-8 text-green-400 mx-auto" />
        <p className="font-display text-xl font-bold text-white">Thank you, that is sent</p>
        <p className="text-sm text-gray-400">The team reads everything. If we answer, you will get a notice in the bell.</p>
        <button type="button" onClick={() => setSent(false)} className="btn btn-primary px-4 py-2 text-sm rounded-xl">Send another</button>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="card rounded-2xl p-5 space-y-4">
      <fieldset className="fieldset">
        <legend className="fieldset-legend"><label htmlFor="feedback-title">Title</label></legend>
        <input id="feedback-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={FEEDBACK_LIMITS.title} required className="input w-full" placeholder="A short name for your idea" />
      </fieldset>
      <fieldset className="fieldset">
        <legend className="fieldset-legend"><label htmlFor="feedback-body">Details</label></legend>
        <textarea id="feedback-body" value={body} onChange={e => setBody(e.target.value)} maxLength={FEEDBACK_LIMITS.body} required rows={6} className="textarea w-full" placeholder="What would you like, and why would it help?" />
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="btn btn-primary px-5 py-2 text-sm rounded-xl disabled:opacity-60">{busy ? 'Sending…' : 'Send'}</button>
        <span className="text-xs text-gray-500">{left} of {FEEDBACK_LIMITS.perDay} sends left today</span>
      </div>
    </form>
  );
}

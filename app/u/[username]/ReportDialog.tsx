'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { postJson } from '@/app/components/captcha-client';
import { FEEDBACK_LIMITS, REPORT_REASONS, REPORT_REASON_LABELS, type ReportReason } from '@/lib/feedback-core';

const field = 'w-full rounded-xl border border-gray-700 bg-gray-950/70 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-yellow-500 focus:outline-hidden';

/** The report form, opened from the profile's menu. Staff see who sent it; the reported person never does. */
export function ReportDialog({ target, name, onClose }: { target: string; name: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason>('offensive');
  const [details, setDetails] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      // A pasted full address is cut down to its path, so only a trade or print page on this site is kept.
      let path = link.trim();
      try { const u = new URL(path, window.location.origin); if (u.origin === window.location.origin) path = u.pathname; } catch { /* keep as typed */ }
      const res = await postJson('/api/feedback/report', { target, reason, details, link: path });
      const data = await res.json().catch(() => ({})) as { error?: string; captcha?: boolean };
      if (res.ok) { setSent(true); return; }
      setError(data.captcha ? 'Please complete the quick check and send again.' : data.error || 'Could not send that. Try again.');
    } catch {
      setError('Could not reach the site. Check your connection and try again.');
    } finally { setBusy(false); }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`Report ${name}`} className="fixed inset-0 z-90 grid place-items-center overflow-y-auto p-4 bg-black/60 backdrop-blur-xs" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl">
        {sent ? (
          <div className="space-y-3 text-center" role="status">
            <Icon name="check" className="w-8 h-8 text-green-400 mx-auto" />
            <p className="font-display text-xl font-bold text-white">Thanks, staff will look at it</p>
            <p className="text-sm text-gray-400">The person you reported is not told it was you. You will get a notice when staff have closed it.</p>
            <button type="button" onClick={onClose} className="tcg-btn px-4 py-2 text-sm rounded-xl">Close</button>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-4">
            <div>
              <h2 className="font-display text-xl font-bold text-white"><Icon name="flag" className="mr-2 text-yellow-400" />Report {name}</h2>
              <p className="text-xs text-gray-500 mt-1">Only staff see this, and they see who sent it. {name} is never told.</p>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Reason</legend>
              {REPORT_REASONS.map(r => (
                <label key={r} className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-yellow-500" />{REPORT_REASON_LABELS[r]}
                </label>
              ))}
            </fieldset>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Details{reason === 'other' ? ' (required)' : ' (optional)'}</span>
              <textarea value={details} onChange={e => setDetails(e.target.value)} rows={4} maxLength={FEEDBACK_LIMITS.reportDetails} required={reason === 'other'} minLength={reason === 'other' ? FEEDBACK_LIMITS.reportDetailsMin : undefined} className={field} placeholder="What happened?" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Link to a trade or print (optional)</span>
              <input value={link} onChange={e => setLink(e.target.value)} maxLength={200} className={field} placeholder="/trade/..." />
            </label>
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={busy} className="tcg-btn px-4 py-2 text-sm rounded-xl disabled:opacity-60">{busy ? 'Sending…' : 'Send report'}</button>
              <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-white">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

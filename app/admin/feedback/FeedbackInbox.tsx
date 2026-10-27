import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { Chip, EmptyState, Panel, areaClass, selectClass } from '../components/ui';
import { PendingButton } from '@/app/components/PendingButton';
import { declineDeletionAction, deleteViewerForRequestAction, updateFeedbackAction } from '../feedback-actions';
import { DELETION_OVERDUE_DAYS, FEEDBACK_KINDS, FEEDBACK_LIMITS, FEEDBACK_STATUSES, KIND_LABELS, REPORT_REASON_LABELS, STATUS_LABELS, type FeedbackItem, type FeedbackKind, type FeedbackStatus } from '@/lib/feedback-core';

const when = (at: number) => new Date(at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

function filterHref(base: string, kind?: FeedbackKind, status?: FeedbackStatus) {
  const p = new URLSearchParams();
  if (kind) p.set('kind', kind);
  if (status) p.set('status', status);
  return p.size ? `${base}?${p}` : base;
}

/** The shared inbox for /admin/feedback and /mod/feedback: filters, then one card per item with a status and reply form. */
export function FeedbackInbox({ items, base, kind, status, viewerHref, canDelete = false, deletionWaiting = 0, reportWaiting = 0 }: { items: FeedbackItem[]; base: string; kind?: FeedbackKind; status?: FeedbackStatus; viewerHref: (user: string) => string; /** Admins only: show Delete this viewer / Decline on deletion requests. */ canDelete?: boolean; /** Deletion requests still waiting, shown in red beside the filter. */ deletionWaiting?: number; /** User reports still waiting, shown beside the Reports filter. */ reportWaiting?: number }) {
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs font-semibold ${on ? 'border-yellow-400/60 bg-yellow-500/15 text-yellow-200' : 'border-gray-700 text-gray-400 hover:text-white'}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Filters">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind">
          <Link href={filterHref(base, undefined, status)} className={chip(!kind)}>All kinds</Link>
          {FEEDBACK_KINDS.map(k => <Link key={k} href={filterHref(base, k, status)} className={chip(kind === k)}>{KIND_LABELS[k]}{k === 'deletion' && deletionWaiting > 0 && <span className="ml-1.5 rounded-full bg-red-500/25 px-1.5 text-[10px] font-extrabold text-red-300" aria-label={`${deletionWaiting} waiting`}>{deletionWaiting}</span>}{k === 'report' && reportWaiting > 0 && <span className="ml-1.5 rounded-full bg-red-500/25 px-1.5 text-[10px] font-extrabold text-red-300" aria-label={`${reportWaiting} waiting`}>{reportWaiting}</span>}</Link>)}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
          <Link href={filterHref(base, kind, undefined)} className={chip(!status)}>Any status</Link>
          {FEEDBACK_STATUSES.map(s => <Link key={s} href={filterHref(base, kind, s)} className={chip(status === s)}>{STATUS_LABELS[s]}</Link>)}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon="inbox" title="Nothing here">No feedback matches those filters.</EmptyState>
      ) : items.map(i => (
        <Panel key={i.id} title={i.title} icon={i.kind === 'bug' ? 'wrench' : i.kind === 'deletion' ? 'trash' : i.kind === 'report' ? 'flag' : 'sparkles'} hint={`${KIND_LABELS[i.kind]} from @${i.user} · ${when(i.at)}`} actions={<span className="flex gap-1.5">{i.aboutStaff && <Chip tone="red">About staff: {i.aboutStaff.map(l => `@${l}`).join(', ')}</Chip>}{i.kind === 'deletion' && i.status === 'new' && Date.now() - i.at > DELETION_OVERDUE_DAYS * 86_400_000 && <Chip tone="red">Overdue</Chip>}<Chip tone={i.status === 'new' ? (i.kind === 'deletion' || i.kind === 'report' ? 'red' : 'amber') : i.status === 'done' ? 'green' : 'gray'}>{STATUS_LABELS[i.status]}</Chip></span>}>
          <div className="space-y-3 text-sm">
            {i.kind === 'report' && i.reason && <p className="text-gray-300"><span className="font-bold text-gray-400">Reason:</span> {REPORT_REASON_LABELS[i.reason]}</p>}
            {i.body ? <p className="whitespace-pre-wrap wrap-break-word text-gray-200">{i.body}</p> : i.kind === 'report' && <p className="text-gray-500">No details given.</p>}
            {i.expected && <p className="whitespace-pre-wrap wrap-break-word text-gray-300"><span className="font-bold text-gray-400">Expected:</span> {i.expected}</p>}
            {i.kind === 'report' && i.target && (
              <p className="text-xs flex flex-wrap gap-x-4 gap-y-1">
                <Link href={`/u/${encodeURIComponent(i.target)}`} className="text-yellow-400 hover:text-yellow-300"><Icon name="user" className="mr-1" />@{i.target}&rsquo;s profile</Link>
                <Link href={viewerHref(i.target)} className="text-yellow-400 hover:text-yellow-300"><Icon name="shield" className="mr-1" />Admin user page</Link>
                {i.from && <Link href={i.from} className="text-yellow-400 hover:text-yellow-300"><Icon name="link" className="mr-1" />{i.from.startsWith('/trade') ? 'The trade' : 'The edition'}</Link>}
              </p>
            )}
            {i.kind !== 'report' && i.from && <p className="text-xs text-gray-500">Page: <span className="font-mono text-gray-300 break-all">{i.from}</span></p>}
            {i.meta && (i.meta.ua || i.meta.screen || i.meta.build) && (
              <p className="text-xs text-gray-500 wrap-break-word">Device: {[i.meta.build, i.meta.screen, i.meta.ua].filter(Boolean).join(' · ')}</p>
            )}
            <p className="text-xs"><Link href={viewerHref(i.user)} className="text-yellow-400 hover:text-yellow-300"><Icon name="user" className="mr-1" />@{i.user}</Link>{i.repliedBy && <span className="text-gray-600"> · last changed by {i.repliedBy}</span>}</p>
            {i.kind === 'deletion' ? (
              <div className="space-y-3 border-t border-gray-800 pt-3">
                {i.reply && <p className="text-gray-300"><span className="font-bold text-gray-400">Reason given:</span> {i.reply}</p>}
                {i.status === 'new' && canDelete && (
                  <>
                    <details className="rounded-xl border border-red-500/30 bg-red-950/10 p-3">
                      <summary className="cursor-pointer text-sm font-bold text-red-300">Delete this viewer…</summary>
                      <form action={deleteViewerForRequestAction.bind(null, i.id)} className="mt-3 space-y-2">
                        <p className="text-gray-300">Deletes @{i.user}: collection (their editions are retired), profile, settings, notices, alert devices, feedback and watch alerts. Their open offers are cancelled first. A restore point is kept for 14 days. This cannot be undone from the site.</p>
                        <PendingButton pendingLabel="Deleting…" className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500">Delete @{i.user} for good</PendingButton>
                      </form>
                    </details>
                    <form action={declineDeletionAction.bind(null, i.id)} className="space-y-2">
                      <label className="block space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Decline, with a reason (they are told)</span>
                        <textarea name="reason" required minLength={3} maxLength={FEEDBACK_LIMITS.reply} rows={2} className={areaClass} />
                      </label>
                      <PendingButton pendingLabel="Saving…" className="rounded-xl border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-gray-400">Decline</PendingButton>
                    </form>
                  </>
                )}
                {i.status === 'new' && !canDelete && <p className="text-xs text-gray-500">Only admins can handle deletion requests.</p>}
              </div>
            ) : (
            <form action={updateFeedbackAction.bind(null, i.id)} className="space-y-2 border-t border-gray-800 pt-3">
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{i.kind === 'report' ? 'Staff note (the reporter is only told the outcome, never this)' : 'Reply to the sender (shown in their bell and on /feedback)'}</span>
                <textarea name="reply" defaultValue={i.reply ?? ''} maxLength={FEEDBACK_LIMITS.reply} rows={2} className={areaClass} />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`status-${i.id}`}>Status</label>
                <select id={`status-${i.id}`} name="status" defaultValue={i.status} className={selectClass}>
                  {FEEDBACK_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <PendingButton pendingLabel="Saving…" className="btn btn-primary px-4 py-2 text-sm rounded-xl">Save</PendingButton>
              </div>
            </form>
            )}
          </div>
        </Panel>
      ))}
    </div>
  );
}

import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { Chip, EmptyState, Panel, fieldClass, selectClass } from '../components/ui';
import { PendingButton } from '../components/PendingButton';
import { updateFeedbackAction } from '../feedback-actions';
import { FEEDBACK_KINDS, FEEDBACK_LIMITS, FEEDBACK_STATUSES, KIND_LABELS, STATUS_LABELS, type FeedbackItem, type FeedbackKind, type FeedbackStatus } from '@/lib/feedback-core';

const when = (at: number) => new Date(at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

function filterHref(base: string, kind?: FeedbackKind, status?: FeedbackStatus) {
  const p = new URLSearchParams();
  if (kind) p.set('kind', kind);
  if (status) p.set('status', status);
  return p.size ? `${base}?${p}` : base;
}

/** The shared inbox for /admin/feedback and /mod/feedback: filters, then one card per item with a status and reply form. */
export function FeedbackInbox({ items, base, kind, status, viewerHref }: { items: FeedbackItem[]; base: string; kind?: FeedbackKind; status?: FeedbackStatus; viewerHref: (user: string) => string }) {
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs font-semibold ${on ? 'border-yellow-400/60 bg-yellow-500/15 text-yellow-200' : 'border-gray-700 text-gray-400 hover:text-white'}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Filters">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind">
          <Link href={filterHref(base, undefined, status)} className={chip(!kind)}>All kinds</Link>
          {FEEDBACK_KINDS.map(k => <Link key={k} href={filterHref(base, k, status)} className={chip(kind === k)}>{KIND_LABELS[k]}</Link>)}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
          <Link href={filterHref(base, kind, undefined)} className={chip(!status)}>Any status</Link>
          {FEEDBACK_STATUSES.map(s => <Link key={s} href={filterHref(base, kind, s)} className={chip(status === s)}>{STATUS_LABELS[s]}</Link>)}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon="inbox" title="Nothing here">No feedback matches those filters.</EmptyState>
      ) : items.map(i => (
        <Panel key={i.id} title={i.title} icon={i.kind === 'bug' ? 'wrench' : 'sparkles'} hint={`${KIND_LABELS[i.kind]} from @${i.user} · ${when(i.at)}`} actions={<Chip tone={i.status === 'new' ? 'amber' : i.status === 'done' ? 'green' : 'gray'}>{STATUS_LABELS[i.status]}</Chip>}>
          <div className="space-y-3 text-sm">
            <p className="whitespace-pre-wrap break-words text-gray-200">{i.body}</p>
            {i.expected && <p className="whitespace-pre-wrap break-words text-gray-300"><span className="font-bold text-gray-400">Expected:</span> {i.expected}</p>}
            {i.from && <p className="text-xs text-gray-500">Page: <span className="font-mono text-gray-300 break-all">{i.from}</span></p>}
            {i.meta && (i.meta.ua || i.meta.screen || i.meta.build) && (
              <p className="text-xs text-gray-500 break-words">Device: {[i.meta.build, i.meta.screen, i.meta.ua].filter(Boolean).join(' · ')}</p>
            )}
            <p className="text-xs"><Link href={viewerHref(i.user)} className="text-yellow-400 hover:text-yellow-300"><Icon name="user" className="mr-1" />@{i.user}</Link>{i.repliedBy && <span className="text-gray-600"> · last changed by {i.repliedBy}</span>}</p>
            <form action={updateFeedbackAction.bind(null, i.id)} className="space-y-2 border-t border-gray-800 pt-3">
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Reply to the sender (shown in their bell and on /feedback)</span>
                <textarea name="reply" defaultValue={i.reply ?? ''} maxLength={FEEDBACK_LIMITS.reply} rows={2} className={fieldClass} />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`status-${i.id}`}>Status</label>
                <select id={`status-${i.id}`} name="status" defaultValue={i.status} className={selectClass}>
                  {FEEDBACK_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <PendingButton pendingLabel="Saving…" className="tcg-btn px-4 py-2 text-sm rounded-xl">Save</PendingButton>
              </div>
            </form>
          </div>
        </Panel>
      ))}
    </div>
  );
}

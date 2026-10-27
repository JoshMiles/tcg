import { requireAdmin } from '@/lib/admin-guard';
import { listFeedback } from '@/lib/feedback';
import { FEEDBACK_KINDS, FEEDBACK_LIMITS, isStatus, type FeedbackKind } from '@/lib/feedback-core';
import { PageHeader } from '../components/ui';
import { FeedbackInbox } from './FeedbackInbox';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Feedback' };

export default async function AdminFeedbackPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const kind = (FEEDBACK_KINDS as string[]).includes(sp.kind ?? '') ? (sp.kind as FeedbackKind) : undefined;
  const status = isStatus(sp.status) ? sp.status : undefined;
  const all = await listFeedback();
  const items = all.filter(i => (!kind || i.kind === kind) && (!status || i.status === status)).sort((a, b) => Number(!!b.aboutStaff) - Number(!!a.aboutStaff)); // about staff first (stable)
  const waiting = (k: FeedbackKind) => all.filter(i => i.kind === k && i.status === 'new').length;
  return (
    <div className="space-y-6">
      <PageHeader title="Feedback" icon="chat" subtitle={`Suggestions, problem reports and user reports from viewers. Answering or changing a status notifies the sender. Resolved items are deleted ${FEEDBACK_LIMITS.keepDaysAfterResolved} days later.`} />
      <FeedbackInbox items={items} base="/admin/feedback" kind={kind} status={status} canDelete deletionWaiting={waiting('deletion')} reportWaiting={waiting('report')} viewerHref={u => `/admin/users/${encodeURIComponent(u)}`} />
    </div>
  );
}

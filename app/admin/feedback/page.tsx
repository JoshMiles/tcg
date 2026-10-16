import { requireAdmin } from '@/lib/admin-guard';
import { listFeedback } from '@/lib/feedback';
import { FEEDBACK_KINDS, FEEDBACK_LIMITS, isStatus, type FeedbackKind } from '@/lib/feedback-core';
import { PageHeader } from '../components/ui';
import { FeedbackInbox } from './FeedbackInbox';

export const metadata = { title: 'Feedback' };
export const dynamic = 'force-dynamic';

export default async function AdminFeedbackPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const kind = (FEEDBACK_KINDS as string[]).includes(sp.kind ?? '') ? (sp.kind as FeedbackKind) : undefined;
  const status = isStatus(sp.status) ? sp.status : undefined;
  const [items, waiting] = await Promise.all([listFeedback({ kind, status }), listFeedback({ kind: 'deletion', status: 'new' })]);
  return (
    <div className="space-y-6">
      <PageHeader title="Feedback" icon="chat" subtitle={`Suggestions and problem reports from viewers. Answering or changing a status notifies the sender. Resolved items are deleted ${FEEDBACK_LIMITS.keepDaysAfterResolved} days later.`} />
      <FeedbackInbox items={items} base="/admin/feedback" kind={kind} status={status} canDelete deletionWaiting={waiting.length} viewerHref={u => `/admin/users/${encodeURIComponent(u)}`} />
    </div>
  );
}

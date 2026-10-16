import { requireStaff } from '@/lib/staff-guard';
import { listFeedback } from '@/lib/feedback';
import { FEEDBACK_KINDS, FEEDBACK_LIMITS, isStatus, type FeedbackKind } from '@/lib/feedback-core';
import { PageHeader } from '../../admin/components/ui';
import { FeedbackInbox } from '../../admin/feedback/FeedbackInbox';

export const metadata = { title: 'Feedback · Mod', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function ModFeedbackPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string }> }) {
  await requireStaff('mod');
  const sp = await searchParams;
  const kind = (FEEDBACK_KINDS as string[]).includes(sp.kind ?? '') ? (sp.kind as FeedbackKind) : undefined;
  const status = isStatus(sp.status) ? sp.status : undefined;
  const items = await listFeedback({ kind, status });
  return (
    <div className="space-y-6">
      <PageHeader title="Feedback" icon="chat" subtitle={`Suggestions and problem reports from viewers. Answering or changing a status notifies the sender. Resolved items are deleted ${FEEDBACK_LIMITS.keepDaysAfterResolved} days later.`} />
      <FeedbackInbox items={items} base="/mod/feedback" kind={kind} status={status} viewerHref={u => `/mod/users/${encodeURIComponent(u)}`} />
    </div>
  );
}

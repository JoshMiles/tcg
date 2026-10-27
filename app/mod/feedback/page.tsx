import { requireStaff } from '@/lib/staff-guard';
import { listFeedback } from '@/lib/feedback';
import { roleCan } from '@/lib/staff-core';
import { FEEDBACK_KINDS, FEEDBACK_LIMITS, isStatus, type FeedbackKind } from '@/lib/feedback-core';
import { PageHeader } from '../../admin/components/ui';
import { FeedbackInbox } from '../../admin/feedback/FeedbackInbox';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Feedback · Mod', robots: { index: false } };

export default async function ModFeedbackPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string }> }) {
  const staff = await requireStaff('mod');
  const sp = await searchParams;
  const kind = (FEEDBACK_KINDS as string[]).includes(sp.kind ?? '') ? (sp.kind as FeedbackKind) : undefined;
  const status = isStatus(sp.status) ? sp.status : undefined;
  const all = await listFeedback({}, { login: staff.login, admin: roleCan(staff.role, 'admin') }); // items that name this mod are left out
  const items = all.filter(i => (!kind || i.kind === kind) && (!status || i.status === status));
  const waiting = (k: FeedbackKind) => all.filter(i => i.kind === k && i.status === 'new').length;
  return (
    <div className="space-y-6">
      <PageHeader title="Feedback" icon="chat" subtitle={`Suggestions, problem reports and user reports from viewers. Answering or changing a status notifies the sender. Resolved items are deleted ${FEEDBACK_LIMITS.keepDaysAfterResolved} days later.`} />
      <FeedbackInbox items={items} base="/mod/feedback" kind={kind} status={status} deletionWaiting={waiting('deletion')} reportWaiting={waiting('report')} viewerHref={u => `/mod/users/${encodeURIComponent(u)}`} />
    </div>
  );
}

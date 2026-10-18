# app/admin/feedback/FeedbackInbox.tsx

- when · function · L8-L8 — when = (at: number)
- filterHref · function · L10-L15 — function filterHref(base: string, kind?: FeedbackKind, status?: FeedbackStatus)
- FeedbackInbox · function · L18-L96 — function FeedbackInbox({ items, base, kind, status, viewerHref, canDelete = false, deletionWaiting = 0, reportWaiting = 0 }: { items: FeedbackItem[]; base: string; kind?: FeedbackKind; status?: FeedbackStatus; viewerHref: (user: string) => string; /** Admins only: show Delete this viewer / Decline on deletion requests. */ canDelete?: boolean; /** Deletion requests still waiting, shown in red beside the filter. */ deletionWaiting?: number; /** User reports still waiting, shown beside the Reports filter. */ reportWaiting?: number })
- chip · function · L19-L19 — chip = (on: boolean)

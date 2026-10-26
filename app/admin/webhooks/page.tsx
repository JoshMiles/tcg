import { redirect } from 'next/navigation';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Webhooks moved into Settings; keep the old URL working for bookmarks.
export default function WebhooksPage() {
  redirect('/admin/settings?tab=webhooks');
}

import { redirect } from 'next/navigation';

// Webhooks moved into Settings; keep the old URL working for bookmarks.
export default function WebhooksPage() {
  redirect('/admin/settings?tab=webhooks');
}

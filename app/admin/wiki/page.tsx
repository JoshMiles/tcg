import { staffPage } from '@/lib/staff-guard';
import { notFound } from 'next/navigation';
import { getWikiPage } from '@/lib/wiki';
import { WikiScreen } from './WikiScreen';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Staff wiki · Admin', robots: { index: false } };

/** Staff handbook. The admin layout already requires an admin or the super admin. */
export default async function WikiIndexPage() {
  await staffPage('admin');
  const page = getWikiPage('index');
  if (!page) notFound();
  return <WikiScreen page={page} />;
}

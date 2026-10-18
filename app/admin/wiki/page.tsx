import { notFound } from 'next/navigation';
import { getWikiPage } from '@/lib/wiki';
import { WikiScreen } from './WikiScreen';

export const metadata = { title: 'Staff wiki · Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Staff handbook. The admin layout already requires an admin or the super admin. */
export default function WikiIndexPage() {
  const page = getWikiPage('index');
  if (!page) notFound();
  return <WikiScreen page={page} />;
}

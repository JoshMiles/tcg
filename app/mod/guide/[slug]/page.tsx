import { notFound } from 'next/navigation';
import { staffPage } from '@/lib/staff-guard';
import { getModGuidePage } from '@/lib/wiki';
import { WikiBody } from '../../../admin/wiki/WikiBody';
import { PageHeader } from '../../../admin/components/ui';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Guide · Mod', robots: { index: false } };

/** One mod guide topic. A topic not marked for mods is not found, whatever its slug. */
export default async function ModGuideTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  await staffPage('mod');
  const { slug } = await params;
  const page = getModGuidePage(slug);
  if (!page) notFound();
  return (
    <div className="space-y-6">
      <PageHeader icon="book" title={page.title} subtitle={page.summary} back={{ href: '/mod/guide', label: 'Mod guide' }} />
      <article className="card min-w-0 max-w-3xl rounded-2xl p-5 sm:p-6">
        <WikiBody source={page.body} />
      </article>
    </div>
  );
}

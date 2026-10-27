import Link from 'next/link';
import { staffPage } from '@/lib/staff-guard';
import { loadModGuide } from '@/lib/wiki';
import { PageHeader } from '../../admin/components/ui';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Guide · Mod', robots: { index: false } };

/** The staff wiki topics marked `audience: mods`. */
export default async function ModGuidePage() {
  await staffPage('mod');
  const topics = loadModGuide();
  return (
    <div className="space-y-6">
      <PageHeader icon="book" title="Mod guide" subtitle="Short notes on the calls mods make." />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map(t => (
          <li key={t.slug}>
            <Link href={`/mod/guide/${t.slug}`} className="card block h-full rounded-2xl p-4 hover:bg-white/5">
              <span className="block font-bold text-white">{t.title}</span>
              <span className="mt-1 block text-sm text-gray-400">{t.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

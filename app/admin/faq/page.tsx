import { staffPage } from '@/lib/staff-guard';
import Link from 'next/link';
import { getFaqStore } from '@/lib/faq';
import { Icon } from '@/app/components/Icon';
import { getFaqContext } from '@/app/(site)/faq/context';
import { PageHeader, Tile } from '../components/ui';
import { FaqEditorClient } from './FaqEditorClient';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'FAQ Editor · Admin', robots: { index: false } };

export default async function FaqAdminPage() {
  await staffPage('admin');
  const [store, { values }] = await Promise.all([getFaqStore(), getFaqContext()]);
  const visibleSections = store.sections.filter(s => !s.hidden).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="FAQ Editor"
        subtitle="Manage the frequently asked questions, reorder section blocks, and add custom questions."
        icon="help"
        actions={
          <Link
            href="/faq"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-outline text-gray-300 hover:text-white"
          >
            <Icon name="external" className="mr-1" /> View live FAQ
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label="Section blocks" value={store.sections.length} sub={`${visibleSections} visible on site`} icon="list" />
        <Tile label="Custom questions" value={store.questions.length} sub="Across all sections" icon="help" tone="amber" />
        <Tile label="Active questions" value={store.questions.filter(q => q.enabled).length} sub="Published to /faq" icon="checkCircle" tone="green" />
      </div>

      <FaqEditorClient store={store} values={values} />
    </div>
  );
}

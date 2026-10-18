import Link from 'next/link';
import { getWikiPage } from '@/lib/wiki';
import { EmptyState } from '../../components/ui';
import { WikiScreen } from '../WikiScreen';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getWikiPage(slug);
  return { title: page ? `${page.title} · Staff wiki` : 'Staff wiki', robots: { index: false } };
}

export default async function WikiTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getWikiPage(slug);
  if (!page) {
    return (
      <div className="mx-auto max-w-xl pt-8">
        <EmptyState asH1 icon="search" title="That topic doesn't exist" action={<Link href="/admin/wiki" className="tcg-btn px-4 py-2 text-sm rounded-xl">All topics</Link>}>
          Open Staff wiki from the sidebar for the topic list.
        </EmptyState>
      </div>
    );
  }
  return <WikiScreen page={page} />;
}

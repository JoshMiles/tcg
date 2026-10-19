import Link from 'next/link';
import { PageHeader } from '../components/ui';
import { loadWiki, wikiHref, type WikiDoc } from '@/lib/wiki';
import { WikiBody } from './WikiBody';

/** The topic list plus one page. Shared by the index and each topic. */
export function WikiScreen({ page }: { page: WikiDoc }) {
  const pages = loadWiki();
  return (
    <div className="space-y-6">
      <PageHeader
        icon="book"
        title={page.slug === 'index' ? 'Staff wiki' : page.title}
        subtitle={page.summary || 'Notes for people running the site.'}
        back={page.slug === 'index' ? undefined : { href: '/admin/wiki', label: 'All topics' }}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Wiki topics" className="card rounded-2xl p-3 lg:sticky lg:top-4">
          <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Topics</p>
          <ul className="space-y-0.5">
            {pages.map(item => {
              const on = item.slug === page.slug;
              return (
                <li key={item.slug}>
                  <Link
                    href={wikiHref(item.slug)}
                    aria-current={on ? 'page' : undefined}
                    className={`block rounded-lg px-2.5 py-1.5 text-sm font-semibold ${on ? 'bg-yellow-400/15 text-yellow-300' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                  >
                    {item.slug === 'index' ? 'Overview' : item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <article className="card min-w-0 rounded-2xl p-5 sm:p-6">
          <WikiBody source={page.body} />
        </article>
      </div>
    </div>
  );
}

import { Icon } from '@/app/components/Icon';
import type { ChangeTag, ChangelogEntry } from '@/lib/changelog';

const TAG_STYLE: Record<ChangeTag, string> = {
  new: 'border-green-500/40 bg-green-500/10 text-green-300',
  improved: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  fixed: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
};

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const formatDate = (d: string) => dateFmt.format(new Date(`${d}T00:00:00Z`));

/** The What's new entries, newest first: the public page and the staff page (admin and mod panels) both use it. */
export function ChangelogList({ entries, showAudience = false, editUrl }: { entries: ChangelogEntry[]; /** Staff page: mark entries players also see. */ showAudience?: boolean; /** Admin page: where to edit an entry that came from a PR. */ editUrl?: (pr: number) => string }) {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return (
    <ol className="space-y-4">
      {sorted.map((e, i) => (
        <li key={`${e.date}-${e.pr ?? i}`} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <time dateTime={e.date} className="text-xs font-semibold text-gray-500">{formatDate(e.date)}</time>
            {e.tags?.map(t => (
              <span key={t} className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TAG_STYLE[t]}`}>{t}</span>
            ))}
            {showAudience && e.audience?.includes('players') && (
              <span className="rounded-full border border-purple-400/40 bg-purple-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-purple-200">Players too</span>
            )}
          </div>
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-white">{e.title}</h2>
            {editUrl && e.pr !== undefined && (
              <a href={editUrl(e.pr)} target="_blank" rel="noopener noreferrer" className="btn btn-xs btn-ghost shrink-0"><Icon name="pencil" />Edit</a>
            )}
          </div>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-300 leading-relaxed">
            {e.items.map(item => <li key={item}>{item}</li>)}
          </ul>
        </li>
      ))}
    </ol>
  );
}

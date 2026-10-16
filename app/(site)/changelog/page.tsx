import type { Metadata } from 'next';
import { CHANGELOG, newestChangelogDate, type ChangeTag } from '@/lib/changelog';
import { MarkChangelogSeen } from '@/app/components/site/ChangelogLink';

export const metadata: Metadata = {
  title: "What's new",
  description: 'The latest changes to The Cheesy TCG, newest first.',
};

const TAG_STYLE: Record<ChangeTag, string> = {
  new: 'border-green-500/40 bg-green-500/10 text-green-300',
  improved: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  fixed: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
};

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const formatDate = (d: string) => dateFmt.format(new Date(`${d}T00:00:00Z`));

export default function ChangelogPage() {
  const entries = [...CHANGELOG].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <MarkChangelogSeen newest={newestChangelogDate()} />
      <header className="space-y-3">
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-white">What&rsquo;s new</h1>
        <p className="text-gray-400 leading-relaxed">Everything we have added or fixed lately, newest first.</p>
      </header>
      <ol className="space-y-4">
        {entries.map((e, i) => (
          <li key={`${e.date}-${i}`} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <time dateTime={e.date} className="text-xs font-semibold text-gray-500">{formatDate(e.date)}</time>
              {e.tags?.map(t => (
                <span key={t} className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TAG_STYLE[t]}`}>{t}</span>
              ))}
            </div>
            <h2 className="font-display text-xl font-bold text-white">{e.title}</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-300 leading-relaxed">
              {e.items.map(item => <li key={item}>{item}</li>)}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

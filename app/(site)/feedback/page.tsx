import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { SiteMessage } from '@/app/components/site/SiteMessage';
import { getSession } from '@/lib/session';
import { feedbackOf, sentToday } from '@/lib/feedback';
import { FEEDBACK_LIMITS, KIND_LABELS, STATUS_LABELS, cleanFrom, type FeedbackKind } from '@/lib/feedback-core';
import { FeedbackForm } from './FeedbackForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Feedback', description: 'Suggest something or report a problem.', robots: { index: false, follow: false } };

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ from?: string; kind?: string }> }) {
  const { from, kind } = await searchParams;
  const session = await getSession();
  if (!session) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (kind) params.set('kind', kind);
    const back = `/feedback${params.size ? `?${params}` : ''}`;
    return (
      <SiteMessage
        icon="chat" title="Log in to send feedback"
        actions={<a href={`/auth/twitch?returnTo=${encodeURIComponent(back)}`} className="tcg-btn px-4 py-2 text-sm rounded-xl">Log in with Twitch</a>}
      >
        <p>We ask you to log in so we can answer you and keep spam out. Log in with Twitch to suggest something or report a problem.</p>
      </SiteMessage>
    );
  }
  const [mine, used] = await Promise.all([feedbackOf(session.username), sentToday(session.username)]);
  const startKind: FeedbackKind = kind === 'bug' || (!kind && from) ? 'bug' : 'idea';

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <header className="space-y-3">
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-white">Feedback</h1>
        <p className="text-gray-400 leading-relaxed">Got an idea, or did something not work? Tell us here. We read all of it and answer in your bell when we can. See also the <Link href="/faq#help" className="text-yellow-400 hover:text-yellow-300">FAQ</Link>.</p>
      </header>

      <FeedbackForm from={cleanFrom(from)} startKind={startKind} left={Math.max(0, FEEDBACK_LIMITS.perDay - used)} />

      {mine.length > 0 && (
        <section className="space-y-3" aria-labelledby="mine">
          <h2 id="mine" className="font-display text-2xl font-bold text-white">Your feedback</h2>
          <ul className="space-y-3">
            {mine.map(i => (
              <li key={i.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-gray-400"><Icon name={i.kind === 'bug' ? 'wrench' : 'sparkles'} className="mr-1" />{KIND_LABELS[i.kind]}</span>
                  <span className="rounded-full border border-gray-700 px-2 py-0.5 font-bold text-gray-300">{STATUS_LABELS[i.status]}</span>
                  <time className="text-gray-500" dateTime={new Date(i.at).toISOString()}>{dateFmt.format(i.at)}</time>
                </div>
                <p className="font-semibold text-white break-words">{i.title}</p>
                {i.reply && <p className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-sm text-yellow-100 whitespace-pre-wrap break-words"><span className="font-bold">Reply:</span> {i.reply}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

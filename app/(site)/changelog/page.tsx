import type { Metadata } from 'next';
import { CHANGELOG, newestChangelogDate } from '@/lib/changelog';
import { MarkChangelogSeen } from '@/app/components/site/ChangelogLink';
import { ChangelogList } from '@/app/components/ChangelogList';

export const metadata: Metadata = {
  title: "What's new",
  description: 'The latest changes to The Cheesy TCG, newest first.',
};

export default function ChangelogPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <MarkChangelogSeen newest={newestChangelogDate()} />
      <header className="space-y-3">
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-white">What&rsquo;s new</h1>
        <p className="text-gray-400 leading-relaxed">Everything we have added or fixed lately, newest first.</p>
      </header>
      <ChangelogList entries={CHANGELOG} />
    </div>
  );
}

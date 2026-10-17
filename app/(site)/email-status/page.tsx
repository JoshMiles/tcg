import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Email notifications', robots: { index: false, follow: false } };

const TEXT: Record<string, { title: string; body: string }> = {
  confirmed: { title: 'Email confirmed', body: 'You will now get the notices you chose by email, at most one every 15 minutes. You can change what you get in Settings.' },
  unsubscribed: { title: 'You are unsubscribed', body: 'We will not email you notifications any more. Your bell notices are unchanged. You can turn email on again in Settings.' },
  invalid: { title: 'That link did not work', body: 'It may have expired, or the address was changed after it was sent. Open Settings to send a new confirmation email.' },
};

// Where the confirm and unsubscribe links of the notification emails land. Needs no sign-in.
export default async function EmailStatusPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const t = TEXT[s ?? ''] ?? TEXT.invalid;
  return (
    <div className="max-w-xl mx-auto px-4 py-12 space-y-4">
      <h1 className="font-display text-3xl font-bold text-white"><Icon name="bell" className="mr-2 text-yellow-400" />{t.title}</h1>
      <p className="text-gray-300">{t.body}</p>
      <Link href="/settings#email" className="inline-block rounded-xl bg-yellow-500 hover:bg-yellow-400 px-4 py-2 text-sm font-bold text-gray-950">Open Settings</Link>
    </div>
  );
}

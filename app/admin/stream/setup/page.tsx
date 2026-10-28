import { redirect } from 'next/navigation';
import { staffPage } from '@/lib/staff-guard';
import { legacySetupHref } from '@/lib/mixitup-wizard';

// The setup wizard is now the Stream page's setup view (ROADMAP 63.4); step, note and error are kept.
export default async function StreamSetupMoved({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await staffPage('admin');
  redirect(legacySetupHref(await searchParams));
}

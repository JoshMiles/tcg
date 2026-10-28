import { redirect } from 'next/navigation';
import { staffPage } from '@/lib/staff-guard';

// The setup wizard moved to /admin/stream/setup (ROADMAP 63.2); step, note and error are kept.
export default async function MixItUpSetupMoved({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await staffPage('admin');
  const q = await searchParams;
  const out = new URLSearchParams();
  for (const k of ['step', 'note', 'error'] as const) if (q[k]) out.set(k, q[k]!);
  redirect(`/admin/stream/setup${out.size ? `?${out}` : ''}`);
}

import { redirect } from 'next/navigation';

export const metadata = { title: 'New pack · Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** Old wizard address (ROADMAP 20.2f): a draft redirects to its workspace, and `/admin/packs/new` goes to the pack library. */
export default async function NewPackPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft } = await searchParams;
  if (draft) redirect(`/admin/packs/${encodeURIComponent(draft)}`);
  redirect('/admin/packs');
}


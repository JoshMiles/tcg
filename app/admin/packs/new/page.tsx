import { redirect } from 'next/navigation';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'New pack · Admin', robots: { index: false } };

/** Old wizard address (ROADMAP 20.2f): a draft redirects to its workspace, and `/admin/packs/new` goes to the pack library. */
export default async function NewPackPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft } = await searchParams;
  if (draft) redirect(`/admin/packs/${encodeURIComponent(draft)}`);
  redirect('/admin/packs');
}


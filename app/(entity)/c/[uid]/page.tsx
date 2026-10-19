import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { listSeasons } from '@/lib/kv';
import { findByUid } from '@/lib/serials';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Card edition', robots: { index: false, follow: true } };

// A copy's short address: /c/1023381 sends you to that copy's page, whichever season it belongs to.
export default async function CopyByNumber({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const n = /^\d{1,9}$/.test(uid) ? Number(uid) : NaN;
  const hit = Number.isFinite(n) ? await findByUid(n) : null;
  if (!hit) notFound();
  const season = (await listSeasons()).find(s => s.collectionName === hit.collection && s.status !== 'draft');
  if (!season) notFound();
  redirect(`/copy/${encodeURIComponent(season.id)}/${hit.copyId}`);
}

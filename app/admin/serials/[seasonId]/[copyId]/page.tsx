import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { getPackCards, getPacksForSeason, getSeason } from '@/lib/kv';
import { getCopy, mintedCounts } from '@/lib/serials';
import { entryOf, parseCopyId } from '@/lib/serials-core';
import { VARIANT_LABELS } from '@/lib/variants';
import { PageHeader } from '../../../components/ui';
import { PrintDetail } from '../../PrintDetail';

// The tab names the copy (its id is card.version.serial), so several open copies can be told apart.
export async function generateMetadata({ params }: { params: Promise<{ seasonId: string; copyId: string }> }) {
  return { title: `Edition ${(await params).copyId} · Admin`, robots: { index: false } };
}
export const dynamic = 'force-dynamic';

// The full page for one print, kept for deep links (the Prints list shows the same details in a side panel).
export default async function AdminCopyPage({ params, searchParams }: { params: Promise<{ seasonId: string; copyId: string }>; searchParams: Promise<{ done?: string; err?: string }> }) {
  const { seasonId: rawSeason, copyId } = await params;
  const sp = await searchParams;
  const seasonId = decodeURIComponent(rawSeason);
  const parsed = parseCopyId(copyId);
  const season = await getSeason(seasonId);
  if (!parsed || !season) notFound();
  const copy = await getCopy(season.collectionName, copyId);
  if (!copy) notFound();

  const packs = await getPacksForSeason(season);
  let card, pack;
  for (const p of packs) { const found = (await getPackCards(p.id)).find(x => x.number === copy.card); if (found) { card = found; pack = p; break; } }
  const made = (await mintedCounts(season.collectionName)).get(entryOf(copy)) ?? copy.n;
  const label = `${copy.variant === 'regular' ? '' : `${VARIANT_LABELS[copy.variant]} `}${card?.name ?? `Card #${copy.card}`}`;
  const here = (id: string) => `/admin/serials/${encodeURIComponent(season.id)}/${id}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={<>{label} <span className="text-yellow-400 tabular-nums">#{copy.n}</span>{copy.uid ? <span className="ml-3 text-base text-gray-400 tabular-nums">Serial #{copy.uid}</span> : null}</>}
        icon="cheese"
        subtitle={`${season.name}${pack ? ` · ${pack.name}` : ''} · ${made.toLocaleString()} ${VARIANT_LABELS[copy.variant]} made`}
        back={{ href: `/admin/serials?season=${encodeURIComponent(season.id)}&card=${copy.card}&v=${copy.variant}`, label: 'Editions' }}
        actions={<Link href={`/copy/${encodeURIComponent(season.id)}/${copy.id}`} className="px-3 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-300 hover:text-white">Public page ↗</Link>}
      />

      {sp.done && <p role="status" className="rounded-xl border border-green-500/30 bg-green-950/30 text-green-300 px-4 py-2.5 text-sm"><Icon name="check" className="mr-1.5" />{sp.done}</p>}
      {sp.err && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/30 text-red-300 px-4 py-2.5 text-sm"><Icon name="warning" className="mr-1.5" />{sp.err}</p>}

      <div className="min-w-0">
        <PrintDetail seasonId={season.id} copy={copy} label={label} hrefFor={here} />
      </div>
    </div>
  );
}

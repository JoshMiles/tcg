import { staffPage } from '@/lib/staff-guard';
import { redirect } from 'next/navigation';
import { getSeason, listAllPacks, listSeasons, getPackCards } from '@/lib/kv';
import { SeasonFlow, type PackOption } from './SeasonFlow';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'New season · Admin', robots: { index: false } };

export default async function NewSeasonPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  await staffPage('admin');
  const { draft } = await searchParams;

  const [allPacks, seasons] = await Promise.all([listAllPacks(), listSeasons()]);
  const counts = await Promise.all(allPacks.map(async p => (await getPackCards(p.id)).length));
  const packs: PackOption[] = allPacks
    .map((p, i) => ({
      id: p.id,
      name: p.name,
      coverImageUrl: p.coverImageUrl,
      status: p.status,
      active: p.active,
      cardCount: counts[i],
      weight: p.weight,
      upgradesEnabled: p.upgradesEnabled,
    }))
    // Published first, then newest drafts.
    .sort((a, b) => Number(a.status === 'draft') - Number(b.status === 'draft'));

  if (draft) {
    const season = await getSeason(draft);
    if (!season) redirect('/admin/seasons/new');
    if (season.status !== 'draft') redirect(`/admin/seasons/${season.id}`);
    return (
      <SeasonFlow
        packs={packs}
        otherCollections={seasons.filter(s => s.id !== season.id).map(s => s.collectionName)}
        initial={{
          id: season.id,
          season: {
            name: season.name,
            collectionName: season.collectionName,
            maxConcurrentPacks: season.maxConcurrentPacks,
            packIds: season.packIds,
            startsAt: season.startsAt,
            endsAt: season.endsAt,
            autoStart: season.autoStart,
          },
        }}
      />
    );
  }

  return <SeasonFlow packs={packs} otherCollections={seasons.map(s => s.collectionName)} />;
}

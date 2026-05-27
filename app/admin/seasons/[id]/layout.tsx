import { getSeason, listPacks } from '@/lib/kv';
import { SeasonNav } from '../../components/SeasonNav';

export const dynamic = 'force-dynamic';

export default async function SeasonLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [season, packs] = await Promise.all([getSeason(id), listPacks(id)]);

  packs.sort((a, b) => a.createdAt - b.createdAt);

  return (
    <div className="flex gap-6 min-h-full">
      <aside className="w-52 shrink-0">
        <SeasonNav
          seasonId={id}
          seasonName={season?.name ?? 'Season'}
          packs={packs}
        />
      </aside>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}

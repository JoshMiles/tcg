import { Icon } from '@/app/components/Icon';
import { PendingButton } from './components/PendingButton';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getActiveSeasonWithPacks } from '@/lib/kv';
import { seedSeason1 } from './actions';
import { OverlayStatus } from './components/OverlayStatus';
import { getDashboardLayout, loadDashboardData } from '@/lib/dashboard-data';
import type { WidgetType } from '@/lib/dashboard';
import { renderWidget } from './dashboard/widgets';
import { DashboardGrid } from './dashboard/DashboardGrid';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ gift?: string }> }) {
  const { gift } = await searchParams; // /admin?gift=username prefills the quick-actions viewer
  const result = await getActiveSeasonWithPacks();

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center">
        <div className="space-y-2">
          <div className="text-5xl mb-4"><Icon name="cards" className="w-14 h-14 text-yellow-400 mx-auto" /></div>
          <h1 className="text-3xl font-bold text-white">Welcome to The Cheesy TCG</h1>
          <p className="text-gray-500 max-w-sm">
            No active season yet. Seed Season 1 to get started with the starter pack, or create your own.
          </p>
        </div>
        <div className="flex gap-3">
          <SeedButton />
          <Link
            href="/admin/seasons/new"
            className="px-5 py-2.5 tcg-btn rounded-xl text-sm transition-colors"
          >
            Create Season
          </Link>
          <Link
            href="/admin/packs/new"
            className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl text-sm transition-colors"
          >
            Create Pack
          </Link>
        </div>
      </div>
    );
  }

  const { season, packs } = result;
  const layout = await getDashboardLayout();
  const needs = new Set<WidgetType>(layout.widgets.map(w => w.type));
  const data = await loadDashboardData(season, packs, needs);
  const nodes: Partial<Record<WidgetType, ReactNode>> = {};
  for (const w of layout.widgets) nodes[w.type] = renderWidget(w.type, data, { gift });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-yellow-500 font-bold uppercase tracking-widest mb-1">★ Active Season</p>
          <h1 className="text-4xl font-bold text-white">{season.name}</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Link href={`/admin/seasons/${season.id}`} className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">Season Settings</Link>
          <Link href={`/leaderboard/${season.id}`} target="_blank" className="px-3 py-1.5 text-xs bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 text-yellow-300 font-semibold rounded-lg transition-colors"><Icon name="trophy" className="mr-1" />Leaderboard ↗</Link>
          <OverlayStatus />
        </div>
      </div>

      <DashboardGrid layout={layout} nodes={nodes} />
    </div>
  );
}

function SeedButton() {
  return (
    <form action={seedSeason1}>
      <PendingButton
        type="submit"
        className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors"
      >
        Seed S1
      </PendingButton>
    </form>
  );
}

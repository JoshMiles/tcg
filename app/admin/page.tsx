import { Icon } from '@/app/components/Icon';
import { PendingButton } from './components/PendingButton';
import { NewPackButton } from './components/NewPackButton';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getActiveSeasonWithPacks, getPackCards, getPacksForSeason, listSeasons } from '@/lib/kv';
import { seedSeason1 } from './actions/seasons';
import { OverlayStatus } from './components/OverlayStatus';
import { staffPage } from '@/lib/staff-guard';
import { loginForLayout } from '@/lib/dashboard';
import { getDashboardLayout, getDashboardPresets, loadDashboardData } from '@/lib/dashboard-data';
import { DashboardControls } from './dashboard/DashboardControls';
import type { WidgetType } from '@/lib/dashboard';
import { renderWidget } from './dashboard/widgets';
import { DashboardGrid } from './dashboard/DashboardGrid';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Dashboard · Admin', robots: { index: false } };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ gift?: string; season?: string; range?: string }> }) {
  const staff = await staffPage('admin');
  const { gift, season: seasonParam, range: rangeParam } = await searchParams; // /admin?gift=username prefills the quick-actions viewer
  // The layout and presets do not depend on the season, so they are read alongside it.
  const [result, layout, presetList] = await Promise.all([getActiveSeasonWithPacks(), getDashboardLayout(loginForLayout(staff)), getDashboardPresets()]);

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
            className="px-5 py-2.5 btn btn-primary rounded-xl text-sm transition-colors"
          >
            Create Season
          </Link>
          <NewPackButton
            label="Create Pack"
            className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl text-sm transition-colors"
          />
          <Link
            href="/admin/wiki"
            className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl text-sm transition-colors"
          >
            Staff wiki
          </Link>
        </div>
      </div>
    );
  }

  // The dashboard can look at any published season; it opens on the active one. (listSeasons is read once per request: getActiveSeasonWithPacks already made this read.)
  const seasons = (await listSeasons()).filter(s => s.status === 'published').sort((a, b) => Number(b.active) - Number(a.active) || b.createdAt - a.createdAt);
  const chosen = seasons.find(s => s.id === seasonParam && s.id !== result.season.id);
  const season = chosen ?? result.season;
  const packs = chosen
    ? await Promise.all((await getPacksForSeason(chosen)).filter(p => p.status === 'published').map(async pack => ({ pack, cards: await getPackCards(pack.id) })))
    : result.packs;
  const range = rangeParam === '24h' || rangeParam === '7d' ? rangeParam : 'season';
  const presets = presetList.map(p => ({ name: p.name, by: p.by }));
  const needs = new Set<WidgetType>(layout.widgets.map(w => w.type));
  const data = await loadDashboardData(season, packs, needs, range);
  const nodes: Partial<Record<WidgetType, ReactNode>> = {};
  for (const w of layout.widgets) nodes[w.type] = renderWidget(w.type, data, { gift });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-yellow-500 font-bold uppercase tracking-widest mb-1">{season.active ? '★ Active Season' : 'Past season'}</p>
          <h1 className="text-4xl font-bold text-white">{season.name}</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Link href={`/admin/seasons/${season.id}`} className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">Season Settings</Link>
          <Link href="/admin/wiki" className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">Staff wiki</Link>
          <Link href={`/leaderboard/${season.id}`} target="_blank" className="px-3 py-1.5 text-xs bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 text-yellow-300 font-semibold rounded-lg transition-colors"><Icon name="trophy" className="mr-1" />Leaderboard ↗</Link>
          <OverlayStatus />
        </div>
      </div>

      <DashboardControls seasons={seasons.map(s => ({ id: s.id, name: s.name, active: s.active }))} seasonId={season.id} range={range} />

      <DashboardGrid layout={layout} nodes={nodes} presets={presets} />
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

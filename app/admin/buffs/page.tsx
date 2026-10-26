import { findBuffUsage, getBuffDefs, type BuffUsage } from '@/lib/buffs';
import { getMixItUpSettings, getOpenGrants } from '@/lib/mixitup';
import { PageHeader, Tile } from '../components/ui';
import { BuffEditorClient } from './BuffEditorClient';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Buff Editor · Admin', robots: { index: false } };

export default async function BuffsPage() {
  const buffs = await getBuffDefs();
  const mix = await getMixItUpSettings();
  const openGrants = await getOpenGrants();
  const usageEntries = await Promise.all(
    buffs.map(async b => [b.id, await findBuffUsage(b.id)] as const),
  );
  const usages: Record<string, BuffUsage> = Object.fromEntries(usageEntries);
  const cardRefCount = Object.values(usages).reduce((s, u) => s + u.cards.length, 0);
  const communityCount = buffs.filter(b => b.scope === 'community').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buff Editor for Trainer Cards"
        subtitle="Create and manage the buff catalogue used by Trainer cards and achievement bonuses."
        icon="zap"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label="Buff definitions" value={buffs.length} sub="Reusable across cards and achievements" icon="zap" />
        <Tile label="Community buffs" value={communityCount} sub="Benefit every viewer when used" icon="users" tone="amber" />
        <Tile label="Trainer cards linked" value={cardRefCount} sub="Across all packs" icon="cards" />
      </div>

      <BuffEditorClient buffs={buffs} usages={usages} mixItUpReady={mix.enabled && !!mix.addUrl} openGrants={openGrants} />
    </div>
  );
}

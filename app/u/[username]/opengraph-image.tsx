import { ImageResponse } from 'next/og';
import { getActiveSeason, getCollection, getUserProfile, getPacksForSeason, getPackCards } from '@/lib/kv';
import { getSeasonLeaderboard } from '@/lib/leaderboard';
import { OG_BG, OG_SIZE, brandIconDataUri } from '@/lib/og';
import { SITE_NAME } from '@/lib/seo';
import { uniqueCount } from '@/lib/collection';
import { getUserSettings } from '@/lib/user-settings-store';

export const alt = 'A collection on The Cheesy TCG';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

// The link preview for /u/<name>: their name, rank, points and how much of the set they own.
export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const lower = decodeURIComponent(username).toLowerCase();
  const [icon, profile, season] = await Promise.all([brandIconDataUri(), getUserProfile(lower).catch(() => null), getActiveSeason().catch(() => null)]);
  const isPrivate = !!(await getUserSettings(lower).catch(() => null))?.privateProfile;
  const name = isPrivate ? 'Private profile' : profile?.displayName || lower; // a private profile's preview shows no name, rank or progress

  let line = isPrivate ? 'On The Cheesy TCG' : 'Collector on The Cheesy TCG';
  let big = '';
  let pct = 0;
  if (season && !isPrivate) {
    try {
      const [board, collection, packs] = await Promise.all([getSeasonLeaderboard(season), getCollection(season.collectionName), getPacksForSeason(season)]);
      const total = (await Promise.all(packs.filter(p => p.status !== 'draft').map(async p => (await getPackCards(p.id)).length))).reduce((a, b) => a + b, 0);
      const mine = collection[lower] ?? [];
      const unique = uniqueCount(mine);
      const idx = board.rows.findIndex(r => r.username === lower);
      pct = total > 0 ? Math.round((unique / total) * 100) : 0;
      big = idx >= 0 ? `#${idx + 1}` : `${pct}%`;
      line = idx >= 0 ? `${Math.round(board.rows[idx].score).toLocaleString()} points · ${unique}/${total} cards · ${season.name}` : `${unique}/${total} cards · ${season.name}`;
    } catch { /* fall back to the plain card */ }
  }

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: 72, background: OG_BG, color: 'white', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ fontSize: 28, color: '#facc15', letterSpacing: 4, textTransform: 'uppercase', fontWeight: 700 }}>{SITE_NAME}</div>
          <div style={{ fontSize: name.length > 14 ? 76 : 100, fontWeight: 800, marginTop: 24, lineHeight: 1.05 }}>{name}</div>
          <div style={{ fontSize: 34, color: '#cbd5e1', marginTop: 20 }}>{line}</div>
          <div style={{ display: 'flex', marginTop: 40, width: 560, height: 22, borderRadius: 11, background: '#1e293b' }}>
            <div style={{ width: `${Math.max(3, pct)}%`, height: 22, borderRadius: 11, background: '#facc15' }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          {big && <div style={{ fontSize: 150, fontWeight: 800, color: '#facc15', lineHeight: 1 }}>{big}</div>}
          {icon && <img src={icon} width={200} height={200} style={{ borderRadius: 36, border: '4px solid #facc15' }} />}
        </div>
      </div>
    ),
    size,
  );
}

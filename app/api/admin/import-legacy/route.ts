import { NextRequest, NextResponse } from 'next/server';
import { getCollection, saveCollection, getUserProfile, saveUserProfile } from '@/lib/kv';
import { LEGACY_DATA, LEGACY_COLLECTION_NAME as COLLECTION_NAME } from '@/lib/legacy-data';

export const dynamic = 'force-dynamic';

// GET /api/admin/import-legacy?secret=<ADMIN_SECRET>
// One-time endpoint to seed Season 1 legacy collection data.
// Pass ?dry=1 to preview without writing.
// Pass ?overwrite=1 to replace existing user data (default: skip users that already have cards).
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const overwrite = req.nextUrl.searchParams.get('overwrite') === '1';

  const existing = await getCollection(COLLECTION_NAME);
  const merged: Record<string, number[]> = { ...existing };

  const results: Record<string, { action: string; cardCount: number }> = {};

  for (const [username, cards] of Object.entries(LEGACY_DATA)) {
    if (existing[username] && !overwrite) {
      results[username] = { action: 'skipped (already has data)', cardCount: existing[username].length };
    } else {
      merged[username] = cards;
      results[username] = {
        action: existing[username] ? 'overwritten' : 'imported',
        cardCount: cards.length,
      };
    }
  }

  if (!dry) {
    await saveCollection(COLLECTION_NAME, merged);

    // Create user profiles for anyone who doesn't already have one
    const profileResults: Record<string, string> = {};
    await Promise.all(
      Object.keys(LEGACY_DATA).map(async (username) => {
        try {
          const existing = await getUserProfile(username);
          if (!existing) {
            await saveUserProfile({
              username,
              displayName: username,
              createdAt: Date.now(),
            });
            profileResults[username] = 'created';
          } else {
            profileResults[username] = 'exists';
          }
        } catch {
          profileResults[username] = 'error';
        }
      })
    );

    return NextResponse.json({
      ok: true,
      collectionName: COLLECTION_NAME,
      usersImported: Object.values(results).filter(r => r.action === 'imported').length,
      usersOverwritten: Object.values(results).filter(r => r.action === 'overwritten').length,
      usersSkipped: Object.values(results).filter(r => r.action.startsWith('skipped')).length,
      details: results,
      profiles: profileResults,
    });
  }

  return NextResponse.json({
    ok: true,
    dry: true,
    collectionName: COLLECTION_NAME,
    preview: results,
  });
}

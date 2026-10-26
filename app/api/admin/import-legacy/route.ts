import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getCollection, saveCollection, getUserProfile, saveUserProfile } from '@/lib/kv';
import { LEGACY_DATA, LEGACY_COLLECTION_NAME as COLLECTION_NAME } from '@/lib/legacy-data';

const NO_STORE = { 'Cache-Control': 'no-store' };

// The old import was a GET that took the admin secret in the query string. That value also signed the emergency
// cookie, so a log line was enough to mint a super-admin session. This is a POST for a signed-in admin only.
// ?dry=1 previews. ?overwrite=1 replaces viewers who already have cards (default: skip them).
export function GET() {
  return NextResponse.json({ error: 'Use POST while signed in as an admin.' }, { status: 405, headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
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
    }, { headers: NO_STORE });
  }

  return NextResponse.json({
    ok: true,
    dry: true,
    collectionName: COLLECTION_NAME,
    preview: results,
  }, { headers: NO_STORE });
}

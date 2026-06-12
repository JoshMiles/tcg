import { NextRequest, NextResponse } from 'next/server';
import { getCollection, saveCollection, getUserProfile, saveUserProfile } from '@/lib/kv';

export const dynamic = 'force-dynamic';

// Legacy Season 1 collection data parsed from olddata.txt
// Key: lowercase Twitch username, Value: array of card numbers (no duplicates — one pull each)
const LEGACY_DATA: Record<string, number[]> = {
  angrymactavish:         [22],
  anvilator_:             [22, 19, 16],
  aronb90:                [19, 21],
  attackamasha:           [7],
  averagejoez:            [22],
  azrakky:                [20],
  b0bbatv:                [17],
  barryelbeardo:          [20],
  bullet2486:             [19, 16, 6, 17, 21, 2, 20, 8, 24, 25, 23, 18, 22, 11, 4, 10],
  carls_b3rg:             [10, 20],
  ceasar47:               [15],
  chaddy0101:             [25, 20, 21, 24, 10, 18, 22, 8, 5, 16, 23, 17, 19, 6, 13],
  cheeseygidds:           [21],
  cheesygidds:            [16, 22, 4, 15, 18, 11, 24, 25, 20, 19, 10, 13, 17, 14, 12, 8, 23, 9, 2, 7, 1, 21, 3, 5],
  community_dpo:          [25],
  crazzycandy99:          [24],
  cynthiap1:              [24],
  daddyalaun:             [24, 13],
  darkstarzz21:           [11],
  debs2107:               [22, 24, 25, 9, 20, 19, 12, 23, 21, 17, 18, 16, 15, 3, 11, 7, 14, 10, 13],
  desifriendplays:        [20],
  dragonateknight:        [19],
  echofcheese:            [21],
  echoofcheese:           [19, 16, 23, 24, 22, 20, 25, 21, 17],
  ecobahn:                [18],
  ellociin:               [20],
  ensosolomon:            [25],
  ervandrik:              [24, 14, 15, 22, 20, 13, 16, 12, 23],
  firstdog314:            [22],
  foxy_andariel:          [18],
  fraggedlew:             [23, 24, 25, 4, 21, 17, 16, 5, 11, 22, 19, 15, 10, 18, 20, 9, 7, 14, 13],
  fuzzy_otters:           [18, 9, 21, 6, 22, 25, 14, 10, 1, 23, 11, 16, 13, 20, 17, 24, 4, 8],
  geckothedev:            [11],
  georgiascrochet:        [24, 21, 25, 23, 14, 10, 9, 19, 16, 20, 18, 22, 17, 5, 15, 3, 11, 4, 1, 12, 6, 7, 8],
  glinskidoodle:          [24],
  hesallthat:             [25],
  hew34:                  [20, 25, 18],
  huffletruffle19:        [24, 13, 23, 17, 22, 18, 19, 21, 25],
  i_took_dorkz:           [22],
  iamvtor:                [25],
  imthecatbot:            [25, 18, 19],
  itsazertive:            [24, 16],
  itsnantoomg:            [23, 21, 6, 11, 22, 15, 25],
  iyebee:                 [17, 24],
  jennphoto112:           [17],
  jh_borba:               [7, 17, 22, 6, 18, 10, 25, 15, 16, 23],
  jhborba:                [17, 20, 18],
  jmslayer12:             [20, 22],
  joejoeuniverse:         [21, 17, 1, 18, 25, 23, 16, 20, 10, 24, 4, 22, 11, 19, 7, 13, 3, 9],
  joreyf:                 [22, 21, 25],
  joshmiles:              [14, 23, 24, 22, 25, 17, 16, 4, 21, 12, 19, 20, 7, 11, 10, 9, 5, 18, 1, 15, 13, 8],
  justjamietv:            [11],
  labhaoise:              [21, 18, 8, 22, 14],
  lazyboy9123:            [15, 21],
  lordike:                [20],
  mainnine:               [22, 10, 17, 21, 5, 16, 18, 7, 8, 23, 20, 12, 24, 14, 9, 6, 25, 15, 19, 13, 1, 4],
  marcus_blue:            [23],
  michaelm238:            [18],
  mike_baz_hunter:        [18],
  mikooki:                [23, 7, 20, 16, 19, 22, 6],
  mildlycompetentcharlie: [25, 18, 23, 22, 8, 17, 20, 19, 11, 21, 9, 16, 13, 15, 10, 2, 24, 7, 14, 5, 12, 3],
  misterfurryhotmuscles:  [13],
  misterwibble:           [21, 25, 9, 11, 24],
  moosenotmeeses:         [11],
  'mrbeast#':             [22],
  mrninjakoala:           [16, 22, 20],
  mrskillingspiders:      [24],
  muddy_kibbles:          [15, 23, 16, 17, 24],
  mvpeebs:                [22, 25, 18, 16, 10, 24, 8, 21],
  mykolasgx:              [17, 24, 11, 21, 22],
  nlgamer2006:            [21, 4, 25, 18, 23, 22, 20, 2, 16, 7, 24],
  osh03:                  [14],
  partysquads:            [19, 25],
  peculiar_phoenix:       [18, 25],
  pokeboyjoshy:           [17],
  pricolatino:            [22, 23, 20, 16, 17, 24, 18, 25, 11, 19, 6, 13, 21, 10, 14],
  puzzledchris:           [7],
  rileywrites2112:        [17],
  rocketteer1:            [21, 11, 17, 10, 23, 12, 18, 9, 22, 24, 20, 25, 16, 19, 15, 13],
  rockysquid:             [25, 21, 24, 23],
  rubyrubay:              [21],
  sad0eyes:               [25, 23, 14, 17, 16, 22, 11, 20, 21, 10, 18, 19, 13, 5, 15, 24, 12, 6, 9],
  sagiso_helba:           [23, 13, 16, 7, 18, 21, 12, 25, 10, 22, 17, 14, 20, 3, 5, 24, 15, 19, 11, 9],
  simon4everggs:          [19],
  sintheoracle:           [21, 14],
  sirfoxttv:              [18, 21, 16],
  skottakus:              [16, 11, 22, 25, 13, 9, 24, 23, 18, 19, 17, 5, 21, 10, 20, 1, 15, 6],
  someone:                [23],
  standbyentrance:        [16, 20, 25],
  streamypanini:          [23, 19, 24, 11, 21, 25, 10, 16, 22, 8, 5, 17, 3, 20, 4, 9, 15, 12],
  syddius:                [25, 16, 18, 2, 24, 23, 20, 13, 17, 11, 15, 5],
  teskidu:                [25],
  thatcataclysm:          [23, 17, 22, 16, 18, 21, 11, 24],
  the_cosmic_nova:        [24],
  the_skaf:               [14, 5, 23],
  thelaughingzebra69:     [22, 25, 24, 12],
  theonemichael1:         [20, 19, 25, 5, 8, 23, 24, 16, 14, 21, 17, 4, 22, 18, 1, 11],
  thepandanico:           [22, 18, 23, 16, 7, 17, 4, 13, 12, 25, 24, 21, 20, 5, 19, 11, 3, 14, 15, 2],
  thomskilive:            [17, 20],
  toffeecake787:          [22, 24, 19, 20, 16, 25, 13, 23, 11, 18, 17, 21, 7, 5, 2, 9, 10, 15, 12, 6, 1, 14],
  tresaugust:             [8, 18, 22, 3, 21, 19, 5, 14, 9, 7, 23, 17, 20, 16, 10],
  truemakaon:             [18],
  viorelsleeps:           [22, 25, 19, 21, 24, 20, 10, 23, 16, 17, 18, 11, 14, 5, 2, 15, 13, 12, 4, 9, 7, 3, 6],
  westmanovich:           [25],
  xbadboi:                [21, 22, 16],
  xxscarbladexx:          [21, 11, 23, 6, 20, 25, 17, 22],
  yes_david:              [4],
  yourunclemeatball:      [25],
  zeovance:               [22],
};

const COLLECTION_NAME = 'CheesyStarterDeck';

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

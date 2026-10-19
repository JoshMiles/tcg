/**
 * Opt-in migration script for variant and rarity alignment (ROADMAP 29.1 / 29.3).
 *
 * Because variant ids ('regular', 'reverse', 'full', 'shiny') kept their
 * existing indices 0..3 and 'golden' was added at index 4, the default plan
 * performs 0 writes. Passing --remap-5star builds an opt-in plan to move
 * existing 5-star cards held at variant index 3 ('shiny') to variant index 4
 * ('golden') in user collections and pack serial ledgers.
 *
 * Usage:
 *   npx tsx scripts/migrate-variant-rarity.mts
 *   npx tsx scripts/migrate-variant-rarity.mts --remap-5star
 *   TCG_REPAIR_CONFIRM=yes npx tsx scripts/migrate-variant-rarity.mts --remap-5star --apply
 *
 * Safety:
 * - Dry-run unless BOTH --apply and TCG_REPAIR_CONFIRM=yes are set.
 * - Refuses --apply if KV_REST_API_TOKEN === KV_REST_API_READ_ONLY_TOKEN.
 * - Refuses --apply when the planned write count is 0.
 */

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const roToken = process.env.KV_REST_API_READ_ONLY_TOKEN;
const applyFlag = process.argv.includes('--apply');
const remap5StarFlag = process.argv.includes('--remap-5star');
const jsonFlag = process.argv.includes('--json');

if (!url || !token) {
  console.error('Missing KV_REST_API_URL or KV_REST_API_TOKEN in environment.');
  process.exit(1);
}
if (applyFlag) {
  if (roToken && token === roToken) {
    console.error('Refusing --apply: KV_REST_API_TOKEN matches KV_REST_API_READ_ONLY_TOKEN.');
    process.exit(1);
  }
  if (process.env.TCG_REPAIR_CONFIRM !== 'yes') {
    console.error('Refusing --apply: set TCG_REPAIR_CONFIRM=yes to confirm writes.');
    process.exit(1);
  }
}
process.env.KV_URL ??= 'redis://unused';

const {
  getSeasons,
  getPacks,
  getPackCards,
  getSeasonCollection,
  setSeasonCollection,
  normalizeRarity,
} = await import('../lib/kv');
const { getPackLedger, savePackLedger } = await import('../lib/serials');
const { decodeEntry, encodeEntry } = await import('../lib/variants');

const [seasons, packs] = await Promise.all([getSeasons(), getPacks()]);

const fiveStarCardIds = new Set<number>();
for (const p of packs) {
  const cards = await getPackCards(p.id);
  for (const c of cards) {
    if (normalizeRarity(c.rarity) === 5) {
      fiveStarCardIds.add(c.id);
    }
  }
}

interface CollectionUpdatePlan {
  collectionName: string;
  usersChanged: number;
  entriesRemapped: number;
  nextCollection: Record<string, number[]>;
}

interface LedgerUpdatePlan {
  packId: string;
  copiesRemapped: number;
  nextLedger: Awaited<ReturnType<typeof getPackLedger>>;
}

const collectionPlans: CollectionUpdatePlan[] = [];
const ledgerPlans: LedgerUpdatePlan[] = [];

if (remap5StarFlag && fiveStarCardIds.size > 0) {
  const seenCollections = new Set<string>();
  for (const s of seasons) {
    if (seenCollections.has(s.collectionName)) continue;
    seenCollections.add(s.collectionName);
    const col = await getSeasonCollection(s.collectionName);
    let usersChanged = 0;
    let entriesRemapped = 0;
    const nextCol: Record<string, number[]> = {};
    for (const [username, entries] of Object.entries(col)) {
      if (!Array.isArray(entries)) {
        nextCol[username] = entries;
        continue;
      }
      let userChanged = false;
      const nextEntries = entries.map(raw => {
        if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return raw;
        const { cardId, variant } = decodeEntry(raw);
        if (variant === 'shiny' && fiveStarCardIds.has(cardId)) {
          userChanged = true;
          entriesRemapped++;
          return encodeEntry(cardId, 'golden');
        }
        return raw;
      });
      if (userChanged) usersChanged++;
      nextCol[username] = nextEntries;
    }
    if (entriesRemapped > 0) {
      collectionPlans.push({
        collectionName: s.collectionName,
        usersChanged,
        entriesRemapped,
        nextCollection: nextCol,
      });
    }
  }

  for (const p of packs) {
    const ledger = await getPackLedger(p.id);
    let copiesRemapped = 0;
    for (const cardId of fiveStarCardIds) {
      const shinyKey = `${cardId}:shiny`;
      const goldenKey = `${cardId}:golden`;
      const shinyList = ledger.copies[shinyKey];
      if (!shinyList || shinyList.length === 0) continue;
      const goldenList = ledger.copies[goldenKey] ? [...ledger.copies[goldenKey]] : [];
      let nextN = ledger.totals[goldenKey] || goldenList.length;
      for (const copy of shinyList) {
        nextN++;
        goldenList.push({
          ...copy,
          variant: 'golden',
          n: nextN,
        });
        copiesRemapped++;
      }
      ledger.copies[goldenKey] = goldenList;
      ledger.totals[goldenKey] = nextN;
      delete ledger.copies[shinyKey];
      delete ledger.totals[shinyKey];
    }
    if (copiesRemapped > 0) {
      ledgerPlans.push({
        packId: p.id,
        copiesRemapped,
        nextLedger: ledger,
      });
    }
  }
}

const plannedWrites = collectionPlans.length + ledgerPlans.length;

if (applyFlag && plannedWrites === 0) {
  console.error('Refusing --apply: plan has 0 writes.');
  process.exit(1);
}

let appliedWrites = 0;
if (applyFlag && plannedWrites > 0) {
  for (const plan of collectionPlans) {
    await setSeasonCollection(plan.collectionName, plan.nextCollection);
    appliedWrites++;
  }
  for (const plan of ledgerPlans) {
    await savePackLedger(plan.packId, plan.nextLedger);
    appliedWrites++;
  }
}

const summary = {
  mode: applyFlag ? 'apply' : 'dry-run',
  remap5Star: remap5StarFlag,
  fiveStarCardsFound: fiveStarCardIds.size,
  plannedWrites,
  appliedWrites,
  collections: collectionPlans.map(c => ({
    collectionName: c.collectionName,
    usersChanged: c.usersChanged,
    entriesRemapped: c.entriesRemapped,
  })),
  ledgers: ledgerPlans.map(l => ({
    packId: l.packId,
    copiesRemapped: l.copiesRemapped,
  })),
};

if (jsonFlag) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(
    `Mode: ${summary.mode} (remap5Star=${summary.remap5Star}) - ${plannedWrites} writes planned (${appliedWrites} writes applied).`,
  );
  if (plannedWrites === 0) {
    console.log('0 writes: variant indices 0..3 did not move and no remaps were queued.');
  } else {
    for (const c of summary.collections) {
      console.log(
        `  collection ${c.collectionName}: ${c.entriesRemapped} entry(s) across ${c.usersChanged} user(s)`,
      );
    }
    for (const l of summary.ledgers) {
      console.log(`  ledger pack:${l.packId}: ${l.copiesRemapped} edition(s)`);
    }
  }
}

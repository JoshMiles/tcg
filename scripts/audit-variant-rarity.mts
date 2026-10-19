/**
 * Read-only audit of variant and rarity data across seasons, packs, cards,
 * legacy collections, and serial ledgers (ROADMAP 29.1).
 *
 * Usage:
 *   npx tsx scripts/audit-variant-rarity.mts          # human summary
 *   npx tsx scripts/audit-variant-rarity.mts --json   # JSON report on stdout
 *
 * Requires KV_REST_API_URL and KV_REST_API_READ_ONLY_TOKEN (falls back to
 * KV_REST_API_TOKEN when the read-only token is unset). Never calls any
 * write helper.
 */

const url = process.env.KV_REST_API_URL;
const roToken = process.env.KV_REST_API_READ_ONLY_TOKEN || process.env.KV_REST_API_TOKEN;
if (!url || !roToken) {
  console.error('Missing KV_REST_API_URL or KV_REST_API_READ_ONLY_TOKEN / KV_REST_API_TOKEN in environment.');
  process.exit(1);
}
process.env.KV_REST_API_TOKEN = roToken;
process.env.KV_URL ??= 'redis://unused';

const jsonFlag = process.argv.includes('--json');

const {
  getSeasons,
  getPacks,
  getPackCards,
  getSeasonCollection,
  normalizeRarity,
} = await import('../lib/kv');
const { getPackLedger, parseCopyId } = await import('../lib/serials');
const { decodeEntry, VARIANT_ORDER } = await import('../lib/variants');

const [seasons, packs] = await Promise.all([getSeasons(), getPacks()]);

const cardsByStars: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
const packsWith4Tiers: { id: string; name: string; count: number }[] = [];
const packsWith5Tiers: { id: string; name: string; count: number }[] = [];
const fiveStarCards: { packId: string; cardId: number; name: string }[] = [];
const fiveStarCardIdSet = new Set<number>();

const packCardsMap = new Map<string, Awaited<ReturnType<typeof getPackCards>>>();
for (const p of packs) {
  const cards = await getPackCards(p.id);
  packCardsMap.set(p.id, cards);
  const starSet = new Set<number>();
  for (const c of cards) {
    const r = normalizeRarity(c.rarity);
    cardsByStars[r] = (cardsByStars[r] || 0) + 1;
    starSet.add(r);
    if (r === 5) {
      fiveStarCards.push({ packId: p.id, cardId: c.id, name: c.name });
      fiveStarCardIdSet.add(c.id);
    }
  }
  if (starSet.has(5)) {
    packsWith5Tiers.push({ id: p.id, name: p.name, count: cards.length });
  } else {
    packsWith4Tiers.push({ id: p.id, name: p.name, count: cards.length });
  }
}

const holdingsByVariantIndex: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
const holdingsIndexGe4: {
  seasonId: string;
  collectionName: string;
  username: string;
  rawEntry: number;
  cardId: number;
  variantIndex: number;
}[] = [];
const fiveStarAtShinyHoldings: {
  seasonId: string;
  collectionName: string;
  username: string;
  cardId: number;
  count: number;
}[] = [];

const seenCollectionNames = new Set<string>();
for (const s of seasons) {
  if (seenCollectionNames.has(s.collectionName)) continue;
  seenCollectionNames.add(s.collectionName);
  const col = await getSeasonCollection(s.collectionName);
  for (const [username, entries] of Object.entries(col)) {
    if (!Array.isArray(entries)) continue;
    const shinyFiveStarCounts = new Map<number, number>();
    for (const raw of entries) {
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) continue;
      const n = Math.floor(raw);
      const rawIdx = n >= 100000 ? Math.floor(n / 100000) : 0;
      const { cardId } = decodeEntry(n);
      holdingsByVariantIndex[rawIdx] = (holdingsByVariantIndex[rawIdx] || 0) + 1;
      if (rawIdx >= 4) {
        holdingsIndexGe4.push({
          seasonId: s.id,
          collectionName: s.collectionName,
          username,
          rawEntry: raw,
          cardId,
          variantIndex: rawIdx,
        });
      }
      if (rawIdx === 3 && fiveStarCardIdSet.has(cardId)) {
        shinyFiveStarCounts.set(cardId, (shinyFiveStarCounts.get(cardId) || 0) + 1);
      }
    }
    for (const [cardId, count] of shinyFiveStarCounts) {
      fiveStarAtShinyHoldings.push({
        seasonId: s.id,
        collectionName: s.collectionName,
        username,
        cardId,
        count,
      });
    }
  }
}

const ledgerCopiesByVariant: Record<string, number> = {};
for (const v of VARIANT_ORDER) ledgerCopiesByVariant[v] = 0;
const invalidCopyIds: { packId: string; bucketKey: string; uid?: number; sampleId: string }[] = [];
const fiveStarShinyLedgerCopies: {
  packId: string;
  cardId: number;
  uid: number;
  n: number;
  owner: string;
}[] = [];

for (const p of packs) {
  const ledger = await getPackLedger(p.id);
  for (const [bucketKey, copies] of Object.entries(ledger.copies)) {
    const colon = bucketKey.indexOf(':');
    const cardIdPart = colon > 0 ? bucketKey.slice(0, colon) : bucketKey;
    const variantPart = colon > 0 ? bucketKey.slice(colon + 1) : '';
    for (const copy of copies) {
      ledgerCopiesByVariant[copy.variant] = (ledgerCopiesByVariant[copy.variant] || 0) + 1;
      const constructed = `${p.id}:${cardIdPart}:${copy.variant}:${copy.n}`;
      if (!parseCopyId(constructed) || variantPart !== copy.variant) {
        invalidCopyIds.push({
          packId: p.id,
          bucketKey,
          uid: copy.uid,
          sampleId: constructed,
        });
      }
      const cid = Number(cardIdPart);
      if (copy.variant === 'shiny' && fiveStarCardIdSet.has(cid)) {
        fiveStarShinyLedgerCopies.push({
          packId: p.id,
          cardId: cid,
          uid: copy.uid,
          n: copy.n,
          owner: copy.owner,
        });
      }
    }
  }
}

const report = {
  noKeysWritten: true,
  seasonsScanned: seasons.length,
  packsScanned: packs.length,
  cardsByStars,
  packTierSummary: {
    fourTierPacks: packsWith4Tiers.length,
    fiveTierPacks: packsWith5Tiers.length,
    packsWith4Tiers,
    packsWith5Tiers,
  },
  fiveStarCardsCount: fiveStarCards.length,
  fiveStarCards,
  holdingsByVariantIndex,
  holdingsIndexGe4Count: holdingsIndexGe4.length,
  holdingsIndexGe4,
  ledgerCopiesByVariant,
  invalidCopyIdsCount: invalidCopyIds.length,
  invalidCopyIds,
  fiveStarAtShinyHoldingsCount: fiveStarAtShinyHoldings.length,
  fiveStarAtShinyHoldings,
  fiveStarShinyLedgerCopiesCount: fiveStarShinyLedgerCopies.length,
  fiveStarShinyLedgerCopies,
};

if (jsonFlag) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('No keys were written.');
  console.log(
    `Scanned ${report.seasonsScanned} season(s) and ${report.packsScanned} pack(s).`,
  );
  console.log(
    `Cards by rarity: 1★=${cardsByStars[1]} 2★=${cardsByStars[2]} 3★=${cardsByStars[3]} 4★=${cardsByStars[4]} 5★=${cardsByStars[5]}`,
  );
  console.log(
    `Packs: ${packsWith4Tiers.length} four-tier (1★..4★), ${packsWith5Tiers.length} five-tier (includes 5★).`,
  );
  console.log(
    `Holdings by variant index: 0(regular)=${holdingsByVariantIndex[0]} 1(reverse)=${holdingsByVariantIndex[1]} 2(full)=${holdingsByVariantIndex[2]} 3(shiny)=${holdingsByVariantIndex[3]} 4(golden)=${holdingsByVariantIndex[4]}`,
  );
  console.log(`Holdings at variant index >= 4: ${holdingsIndexGe4.length}`);
  console.log(
    `Ledger copies by variant: ${VARIANT_ORDER.map(v => `${v}=${ledgerCopiesByVariant[v] || 0}`).join(' ')}`,
  );
  console.log(`Invalid copy ids rejected by parseCopyId: ${invalidCopyIds.length}`);
  console.log(
    `5★ cards held at variant index 3 (shiny): ${fiveStarAtShinyHoldings.length} user bucket(s), ${fiveStarShinyLedgerCopies.length} ledger edition(s).`,
  );
}

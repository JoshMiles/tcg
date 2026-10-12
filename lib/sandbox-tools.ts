import { addCollectionEntry, deleteUserProfile, ensureUserProfile, getActiveSeasonWithPacks, getAllCollectionUsers, getCollection, getUserProfile, listAllPacks, listSeasons, saveCollection, withCollectionLock } from './kv';
import { listOpenTrades } from './trades';
import { getSeasonLeaderboard } from './leaderboard';
import { getHoloResolver, type HoloSpecs } from './holo';
import { runInSandbox } from './db';
import { VARIANTS, effectiveWeights, encodeEntry, rollVariant, upgradesAllowed, type VariantCounts, emptyCounts } from './variants';
import type { Card, Pack, Variant } from './types';

// Helpers for driving a sandbox without needing the stream: simulate pulls the way the overlay would, and hand out specific
// copies (e.g. exactly enough Regulars to test an upgrade). Each runs pinned to the given sandbox, wherever the admin is.

const sanitizeName = (n: string) => n.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 25);

export function cleanTestUsername(input: string): string {
  return sanitizeName(input.trim());
}

type DrawPacks = { pack: Pack; cards: Card[] }[];

/** One overlay-style draw: pack by weight, card by probability, then (where upgrades are on) the variant roll. */
function drawOne(packs: DrawPacks): { card: Card; pack: Pack; variant: Variant } {
  let r = Math.random() * packs.reduce((s, p) => s + (p.pack.weight || 1), 0);
  let chosen = packs[packs.length - 1];
  for (const p of packs) { r -= p.pack.weight || 1; if (r <= 0) { chosen = p; break; } }
  let rp = Math.random() * chosen.cards.reduce((s, c) => s + c.probability, 0);
  let card = chosen.cards[chosen.cards.length - 1];
  for (const c of chosen.cards) { rp -= c.probability; if (rp <= 0) { card = c; break; } }
  const variant: Variant = upgradesAllowed(chosen.pack, card) ? rollVariant(effectiveWeights(chosen.pack, card)) : 'regular';
  return { card, pack: chosen.pack, variant };
}

/** Draws `count` pulls for a user exactly as the overlay does (pack by weight, card by probability, then the variant roll). */
export function simulatePulls(sandboxId: string, username: string, count: number): Promise<{ pulls: number; byVariant: VariantCounts }> {
  return runInSandbox(sandboxId, async () => {
    const user = cleanTestUsername(username);
    if (!user) throw new Error('Enter a username.');
    const active = await getActiveSeasonWithPacks();
    if (!active) throw new Error('This sandbox has no active season. Activate one first.');
    const packs = active.packs.filter(p => p.cards.length > 0 && p.pack.active);
    if (packs.length === 0) throw new Error('No active pack with cards in the active season.');

    const n = Math.max(1, Math.min(500, Math.floor(count) || 1));
    const byVariant = emptyCounts();
    await ensureUserProfile(user);
    for (let i = 0; i < n; i++) {
      const { card, variant } = drawOne(packs);
      await addCollectionEntry(active.season.collectionName, user, encodeEntry(card.number, variant), 'pull');
      byVariant[variant]++;
    }
    return { pulls: n, byVariant };
  });
}

/** Gives a user `count` copies of one card in one variant (the quickest way to set up an upgrade or trade scenario). */
export function grantCopies(sandboxId: string, username: string, cardNumber: number, variant: Variant, count: number): Promise<number> {
  return runInSandbox(sandboxId, async () => {
    const user = cleanTestUsername(username);
    if (!user) throw new Error('Enter a username.');
    if (!VARIANTS.includes(variant)) throw new Error('Unknown variant.');
    const active = await getActiveSeasonWithPacks();
    if (!active) throw new Error('This sandbox has no active season. Activate one first.');
    const exists = active.packs.some(p => p.cards.some(c => c.number === cardNumber));
    if (!exists) throw new Error('That card is not in the active season.');
    const n = Math.max(1, Math.min(200, Math.floor(count) || 1));
    await ensureUserProfile(user);
    for (let i = 0; i < n; i++) await addCollectionEntry(active.season.collectionName, user, encodeEntry(cardNumber, variant), 'grant');
    return n;
  });
}

/** Everyone with a collection in this sandbox, with their copy counts. */
export function listSandboxUsers(sandboxId: string): Promise<{ username: string; copies: number; unique: number }[]> {
  return runInSandbox(sandboxId, async () => {
    const users = await getAllCollectionUsers();
    return users
      .map(u => {
        const all = u.seasons.flatMap(s => s.cards);
        return { username: u.username, copies: all.length, unique: new Set(all.map(e => e % 1_000_000)).size };
      })
      .sort((a, b) => b.copies - a.copies || a.username.localeCompare(b.username));
  });
}

/** The active season's cards (for the "grant copies" picker). */
export function listSandboxCards(sandboxId: string): Promise<{ number: number; name: string; pack: string; imageUrl: string; fullArtImageUrl?: string; holo: HoloSpecs }[]> {
  return runInSandbox(sandboxId, async () => {
    const active = await getActiveSeasonWithPacks();
    if (!active) return [];
    const holoFor = await getHoloResolver();
    return active.packs
      .flatMap(p => p.cards.map(c => ({ number: c.number, name: c.name, pack: p.pack.name, imageUrl: c.imageUrl, fullArtImageUrl: c.fullArtImageUrl, holo: holoFor(p.pack, c.stars) })))
      .sort((a, b) => a.number - b.number);
  });
}

// ── Bulk seeding ──────────────────────────────────────────

const WORDS_A = ['nacho', 'gouda', 'brie', 'swiss', 'cheddar', 'feta', 'edam', 'curd', 'melty', 'crispy', 'cheesy', 'smoky', 'sharp', 'creamy', 'toasty', 'spicy', 'golden', 'holey', 'mighty', 'sleepy', 'turbo', 'lucky', 'salty', 'zesty'];
const WORDS_B = ['gus', 'fox', 'owl', 'moth', 'otter', 'wizard', 'knight', 'ninja', 'goblin', 'panda', 'badger', 'crab', 'llama', 'raven', 'viking', 'robot', 'pirate', 'duck', 'yeti', 'mole', 'newt', 'bear', 'toad', 'hawk'];

/** Distinct, valid, readable usernames that don't clash with anyone already in the collection. */
function makeNames(count: number, taken: Set<string>): string[] {
  const names: string[] = [];
  let guard = 0;
  while (names.length < count && guard++ < count * 40) {
    const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)];
    const b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)];
    const name = `${a}_${b}${guard > count * 4 ? Math.floor(Math.random() * 90 + 10) : ''}`;
    if (!taken.has(name)) { taken.add(name); names.push(name); }
  }
  for (let i = 0; names.length < count; i++) { const name = `viewer_${taken.size + i}`; if (!taken.has(name)) { taken.add(name); names.push(name); } }
  return names;
}

export type SeedShape = 'realistic' | 'even';

/**
 * Creates `count` test viewers who have each pulled a number of cards the way the overlay would draw them, so the leaderboard,
 * card values and scarcity look like a real season. 'realistic' gives a few heavy collectors and many light ones (a long tail);
 * 'even' spreads pulls evenly between min and max. Everything is drawn in memory and written once, so 100 users is quick.
 */
export function seedUsers(
  sandboxId: string,
  opts: { count: number; minPulls: number; maxPulls: number; shape: SeedShape },
): Promise<{ users: number; pulls: number; byVariant: VariantCounts; heaviest: number }> {
  return runInSandbox(sandboxId, async () => {
    const active = await getActiveSeasonWithPacks();
    if (!active) throw new Error('This sandbox has no active season. Activate one first.');
    const packs = active.packs.filter(p => p.cards.length > 0 && p.pack.active);
    if (packs.length === 0) throw new Error('No active pack with cards in the active season.');

    const count = Math.max(1, Math.min(300, Math.floor(opts.count) || 1));
    const min = Math.max(1, Math.min(2000, Math.floor(opts.minPulls) || 1));
    const max = Math.max(min, Math.min(2000, Math.floor(opts.maxPulls) || min));
    const collection = active.season.collectionName;

    const seeded: Record<string, number[]> = {};
    const byVariant = emptyCounts();
    let pulls = 0, heaviest = 0;
    const names = makeNames(count, new Set(Object.keys(await getCollection(collection))));
    for (const name of names) {
      const u = Math.random();
      const n = Math.round(min + (max - min) * (opts.shape === 'even' ? u : u ** 3));
      const entries: number[] = [];
      for (let i = 0; i < n; i++) {
        const { card, variant } = drawOne(packs);
        entries.push(encodeEntry(card.number, variant));
        byVariant[variant]++;
      }
      seeded[name] = entries;
      pulls += n;
      heaviest = Math.max(heaviest, n);
    }

    // One locked read-modify-write for everyone.
    await withCollectionLock(collection, async () => {
      const data = await getCollection(collection);
      for (const [name, entries] of Object.entries(seeded)) data[name] = [...(data[name] ?? []), ...entries];
      await saveCollection(collection, data);
    });
    return { users: names.length, pulls, byVariant, heaviest };
  });
}

/** Every card in the active season with what it is worth right now and why (odds, copies out there). */
export function listCardValues(sandboxId: string): Promise<{
  number: number; name: string; stars: number; pack: string; upgrades: boolean;
  pullRate: number; copies: VariantCounts; values: Record<Variant, number>;
}[]> {
  return runInSandbox(sandboxId, async () => {
    const active = await getActiveSeasonWithPacks();
    if (!active) return [];
    const board = await getSeasonLeaderboard(active.season);
    return board.packs
      .flatMap(({ pack, cards }) => cards.map(c => ({ pack, card: c })))
      .map(({ pack, card }) => {
        const v = board.values.cards.get(card.number);
        return {
          number: card.number, name: card.name, stars: card.stars, pack: pack.name, upgrades: upgradesAllowed(pack, card),
          pullRate: v?.pullRate ?? 0, copies: v?.variantCopies ?? emptyCounts(),
          values: v?.values ?? { regular: 0, reverse: 0, full: 0, shiny: 0 },
        };
      })
      .sort((a, b) => a.number - b.number);
  });
}

// ── Overview, user table and removal ──────────────────────

export interface SandboxStats { users: number; copies: number; unique: number; seasons: number; packs: number; activeSeason: string | null; openTrades: number }

/** Headline numbers for a sandbox (viewers, copies, what is active). */
export function getSandboxStats(sandboxId: string): Promise<SandboxStats> {
  return runInSandbox(sandboxId, async () => {
    const [users, seasons, packs, active, open] = await Promise.all([getAllCollectionUsers(), listSeasons(), listAllPacks(), getActiveSeasonWithPacks(), listOpenTrades().catch(() => [])]);
    const all = users.flatMap(u => u.seasons.flatMap(s => s.cards));
    return {
      users: users.length, copies: all.length, unique: new Set(all.map(e => e % 1_000_000)).size,
      seasons: seasons.length, packs: packs.length, activeSeason: active?.season.name ?? null, openTrades: open.length,
    };
  });
}

export interface SandboxUserRow { username: string; copies: number; unique: number; rank: number | null; score: number | null; complete: boolean; createdAt: number | null }

/** Everyone in the sandbox with their standing in the active season (rank / score), for the Users tab. */
export function listSandboxUserRows(sandboxId: string): Promise<SandboxUserRow[]> {
  return runInSandbox(sandboxId, async () => {
    const [users, active] = await Promise.all([getAllCollectionUsers(), getActiveSeasonWithPacks()]);
    const board = active ? await getSeasonLeaderboard(active.season).catch(() => null) : null;
    const standing = new Map((board?.rows ?? []).map((r, i) => [r.username, { rank: i + 1, score: r.score, complete: r.complete }]));
    return Promise.all(users.map(async u => {
      const all = u.seasons.flatMap(s => s.cards);
      const st = standing.get(u.username);
      return {
        username: u.username, copies: all.length, unique: new Set(all.map(e => e % 1_000_000)).size,
        rank: st?.rank ?? null, score: st ? Math.round(st.score) : null, complete: !!st?.complete,
        createdAt: (await getUserProfile(u.username))?.createdAt ?? null,
      };
    }));
  });
}

/** Empties these viewers' collections ('clear') or removes them entirely, profile included ('delete'). Returns how many had cards. */
export function removeTestUsers(sandboxId: string, usernames: string[], mode: 'clear' | 'delete'): Promise<number> {
  return runInSandbox(sandboxId, async () => {
    const names = [...new Set(usernames.map(cleanTestUsername).filter(Boolean))];
    if (names.length === 0) throw new Error('Pick at least one viewer.');
    let touched = 0;
    for (const season of await listSeasons()) {
      await withCollectionLock(season.collectionName, async () => {
        const data = await getCollection(season.collectionName);
        let changed = false;
        for (const n of names) if (n in data) { delete data[n]; changed = true; touched++; }
        if (changed) await saveCollection(season.collectionName, data);
      });
    }
    if (mode === 'delete') for (const n of names) await deleteUserProfile(n);
    return touched;
  });
}

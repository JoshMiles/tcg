import { addCollectionEntry, ensureUserProfile, getActiveSeasonWithPacks, getAllCollectionUsers } from './kv';
import { runInSandbox } from './db';
import { VARIANTS, effectiveWeights, encodeEntry, rollVariant, upgradesAllowed, type VariantCounts, emptyCounts } from './variants';
import type { Variant } from './types';

// Helpers for driving a sandbox without needing the stream: simulate pulls the way the overlay would, and hand out specific
// copies (e.g. exactly enough Regulars to test an upgrade). Each runs pinned to the given sandbox, wherever the admin is.

const sanitizeName = (n: string) => n.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 25);

export function cleanTestUsername(input: string): string {
  return sanitizeName(input.trim());
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
      let r = Math.random() * packs.reduce((s, p) => s + (p.pack.weight || 1), 0);
      let chosen = packs[packs.length - 1];
      for (const p of packs) { r -= p.pack.weight || 1; if (r <= 0) { chosen = p; break; } }
      let rp = Math.random() * chosen.cards.reduce((s, c) => s + c.probability, 0);
      let card = chosen.cards[chosen.cards.length - 1];
      for (const c of chosen.cards) { rp -= c.probability; if (rp <= 0) { card = c; break; } }
      const variant: Variant = upgradesAllowed(chosen.pack, card) ? rollVariant(effectiveWeights(chosen.pack, card)) : 'regular';
      await addCollectionEntry(active.season.collectionName, user, encodeEntry(card.number, variant));
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
    for (let i = 0; i < n; i++) await addCollectionEntry(active.season.collectionName, user, encodeEntry(cardNumber, variant));
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
export function listSandboxCards(sandboxId: string): Promise<{ number: number; name: string; pack: string }[]> {
  return runInSandbox(sandboxId, async () => {
    const active = await getActiveSeasonWithPacks();
    if (!active) return [];
    return active.packs
      .flatMap(p => p.cards.map(c => ({ number: c.number, name: c.name, pack: p.pack.name })))
      .sort((a, b) => a.number - b.number);
  });
}

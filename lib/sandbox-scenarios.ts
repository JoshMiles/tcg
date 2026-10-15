import { getActiveSeasonWithPacks, saveCollection, getCollection, ensureUserProfile, withCollectionLock } from './kv';
import { runInSandbox } from './db';
import { encodeEntry } from './variants';
import { seedUsers } from './sandbox-tools';
import type { UpgradeCosts } from './types';

// One-click test setups. `planScenario` is pure (given the active season's cards and upgrade costs it says exactly who gets which
// copies) so it can be checked without a database; `applyScenario` writes the plan in one locked pass. Every scenario names its
// viewers (e.g. `upgrade_ready`) so you can find them in the Users tab and "Log in as" them.

export type ScenarioId = 'upgrade-ready' | 'nearly-complete' | 'complete-set' | 'trade-pair' | 'shiny-showcase' | 'crowd';

export interface ScenarioInfo { id: ScenarioId; title: string; description: string; needsUpgrades: boolean; icon: 'sparkles' | 'target' | 'cheese' | 'trade' | 'gem' | 'users' }

export const SCENARIOS: ScenarioInfo[] = [
  { id: 'upgrade-ready', title: 'Ready to upgrade', description: 'upgrade_ready has exactly enough Regulars of three cards for a Reverse Holo upgrade; upgrade_one_short is one copy short.', needsUpgrades: true, icon: 'sparkles' },
  { id: 'nearly-complete', title: 'One card short of a full set', description: 'one_card_short owns every card in the season except one. Pull it, or grant it, to see the complete-collection bonus appear.', needsUpgrades: false, icon: 'target' },
  { id: 'complete-set', title: 'Complete collection', description: 'completionist owns one of every card, for the Complete chip, the set bonus and the end-of-season awards.', needsUpgrades: false, icon: 'cheese' },
  { id: 'trade-pair', title: 'Trade-ready pair', description: 'trader_a and trader_b each have spare copies of cards the other lacks, so a one-for-one trade helps both.', needsUpgrades: false, icon: 'trade' },
  { id: 'shiny-showcase', title: 'Shiny showcase', description: 'shiny_hunter owns Full Art and Shiny copies of three cards, to look at the rarest versions and their points.', needsUpgrades: true, icon: 'gem' },
  { id: 'crowd', title: 'Busy leaderboard', description: '100 realistic viewers with a long tail of light collectors and a few heavy ones.', needsUpgrades: false, icon: 'users' },
];

export interface PlanContext { cards: { number: number; stars: number }[]; costs: UpgradeCosts | null }
export interface Grant { user: string; entries: number[] }
export type Plan = { ok: true; grants: Grant[]; note: string } | { ok: false; error: string };

const copies = (n: number, count: number, variant: Parameters<typeof encodeEntry>[1] = 'regular') => Array.from({ length: Math.max(0, count) }, () => encodeEntry(n, variant));

export function planScenario(id: Exclude<ScenarioId, 'crowd'>, ctx: PlanContext): Plan {
  const nums = [...new Set(ctx.cards.map(c => c.number))].sort((a, b) => a - b);
  if (nums.length === 0) return { ok: false, error: 'The active season has no cards.' };
  const need = SCENARIOS.find(s => s.id === id)!.needsUpgrades;
  if (need && !ctx.costs) return { ok: false, error: 'No pack in the active season has upgrades switched on. Turn them on in the pack settings first.' };

  switch (id) {
    case 'upgrade-ready': {
      const cost = ctx.costs!.reverse;
      const three = nums.slice(0, 3);
      return {
        ok: true,
        grants: [
          { user: 'upgrade_ready', entries: three.flatMap(n => copies(n, cost)) },
          { user: 'upgrade_one_short', entries: copies(three[0], cost - 1) },
        ],
        note: `upgrade_ready has ${cost} Regulars each of ${three.map(n => `#${n}`).join(', ')} (exactly one Reverse Holo upgrade each); upgrade_one_short has ${cost - 1} of #${three[0]}.`,
      };
    }
    case 'nearly-complete': {
      if (nums.length < 2) return { ok: false, error: 'The season needs at least two cards.' };
      const missing = nums[nums.length - 1];
      return { ok: true, grants: [{ user: 'one_card_short', entries: nums.filter(n => n !== missing).flatMap(n => copies(n, 1)) }], note: `one_card_short owns every card except #${missing}.` };
    }
    case 'complete-set':
      return { ok: true, grants: [{ user: 'completionist', entries: nums.flatMap(n => copies(n, 1)) }], note: `completionist owns all ${nums.length} cards.` };
    case 'trade-pair': {
      if (nums.length < 6) return { ok: false, error: 'The season needs at least six cards for a trade pair.' };
      const half = Math.floor(nums.length / 2);
      const a = nums.slice(0, half), b = nums.slice(half);
      const dupes = (list: number[]) => list.slice(0, 3);
      return {
        ok: true,
        grants: [
          { user: 'trader_a', entries: [...a.flatMap(n => copies(n, 1)), ...dupes(a).flatMap(n => copies(n, 2))] },
          { user: 'trader_b', entries: [...b.flatMap(n => copies(n, 1)), ...dupes(b).flatMap(n => copies(n, 2))] },
        ],
        note: `trader_a owns #${a[0]}–#${a[a.length - 1]} with spares of ${dupes(a).map(n => `#${n}`).join(', ')}; trader_b owns the rest with spares of ${dupes(b).map(n => `#${n}`).join(', ')}.`,
      };
    }
    case 'shiny-showcase': {
      const three = nums.slice(0, 3);
      return { ok: true, grants: [{ user: 'shiny_hunter', entries: [...copies(three[0], 1), ...three.flatMap(n => [...copies(n, 1, 'full'), ...copies(n, 1, 'shiny')])] }], note: `shiny_hunter owns Full Art and Shiny ${three.map(n => `#${n}`).join(', ')}.` };
    }
  }
}

/** Applies a scenario inside a sandbox. Returns what was set up and who to look at. */
export function applyScenario(sandboxId: string | null, id: ScenarioId): Promise<{ note: string; users: string[] }> {
  if (id === 'crowd') {
    return seedUsers(sandboxId, { count: 100, minPulls: 3, maxPulls: 150, shape: 'realistic' })
      .then(r => ({ note: `Created ${r.users} viewers with ${r.pulls.toLocaleString()} pulls between them.`, users: [] }));
  }
  return runInSandbox(sandboxId, async () => {
    const active = await getActiveSeasonWithPacks();
    if (!active) throw new Error('This sandbox has no active season. Activate one first.');
    const cards = active.packs.flatMap(p => p.cards.map(c => ({ number: c.number, stars: c.stars })));
    const costs = active.packs.find(p => p.pack.upgradesEnabled)?.pack.upgradeCosts ?? null;
    const plan = planScenario(id, { cards, costs });
    if (!plan.ok) throw new Error(plan.error);
    const collection = active.season.collectionName;
    for (const g of plan.grants) await ensureUserProfile(g.user);
    await withCollectionLock(collection, async () => {
      const data = await getCollection(collection);
      for (const g of plan.grants) data[g.user] = [...(data[g.user] ?? []), ...g.entries];
      await saveCollection(collection, data);
    });
    return { note: plan.note, users: plan.grants.map(g => g.user) };
  });
}

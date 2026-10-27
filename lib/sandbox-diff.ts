// Compares a sandbox's setup with production's (pure, client-safe). A sandbox starts as a copy of production's seasons, packs,
// cards and settings, so anything different has been changed inside the sandbox (or in production since).

export interface Setup {
  seasons: Record<string, Record<string, unknown>>;
  packs: Record<string, Record<string, unknown>>;
  cards: Record<string, Record<string, unknown>[]>;      // by pack id
  settings: Record<string, unknown>;                     // by KV key
}

export type DiffArea = 'Season' | 'Pack' | 'Card' | 'Setting';
export interface FieldChange { field: string; production: string; sandbox: string }
export interface DiffItem { area: DiffArea; id: string; label: string; change: 'added' | 'removed' | 'changed'; fields: FieldChange[] }

export const SETTING_KEYS = ['scoring:settings', 'overlay:settings', 'overlay:packprops', 'overlay:presets'] as const;
const SEASON_FIELDS = ['name', 'collectionName', 'status', 'active', 'maxConcurrentPacks', 'packIds', 'startsAt', 'endsAt', 'autoStart', 'endedAt', 'tradingFrozen'];
const PACK_FIELDS = ['name', 'status', 'active', 'archived', 'weight', 'price', 'coverImageUrl', 'accentColor', 'holoMinStars', 'cardTime', 'cooldownTime', 'soundVolume', 'upgradesEnabled', 'variantWeights', 'upgradeCosts', 'disabledVariants'];
const CARD_FIELDS = ['number', 'name', 'stars', 'probability', 'imageUrl', 'soundUrl', 'fullArtImageUrl', 'stillUrl', 'fullArtStillUrl', 'upgradesEnabled', 'disabledVariants'];

const show = (v: unknown): string => {
  if (v === undefined) return '(not set)';
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  return t.length > 80 ? t.slice(0, 77) + '…' : t;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function fieldDiff(prod: Record<string, unknown> | undefined, box: Record<string, unknown> | undefined, fields: string[]): FieldChange[] {
  const out: FieldChange[] = [];
  for (const f of fields) if (!same(prod?.[f], box?.[f])) out.push({ field: f, production: show(prod?.[f]), sandbox: show(box?.[f]) });
  return out;
}

/** Top-level keys that differ between two settings objects (a short, readable summary of a larger blob). */
function settingDiff(prod: unknown, box: unknown): FieldChange[] {
  const p = (prod && typeof prod === 'object' ? prod : {}) as Record<string, unknown>;
  const b = (box && typeof box === 'object' ? box : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(p), ...Object.keys(b)])].sort();
  return keys.filter(k => !same(p[k], b[k])).map(k => ({ field: k, production: show(p[k]), sandbox: show(b[k]) }));
}

export function diffSetup(prod: Setup, box: Setup): DiffItem[] {
  const items: DiffItem[] = [];
  const name = (r: Record<string, unknown> | undefined, fallback: string) => String(r?.name ?? fallback);

  const walk = (area: DiffArea, p: Record<string, Record<string, unknown>>, b: Record<string, Record<string, unknown>>, fields: string[]) => {
    for (const id of [...new Set([...Object.keys(p), ...Object.keys(b)])].sort()) {
      if (!(id in b)) items.push({ area, id, label: name(p[id], id), change: 'removed', fields: [] });
      else if (!(id in p)) items.push({ area, id, label: name(b[id], id), change: 'added', fields: [] });
      else { const f = fieldDiff(p[id], b[id], fields); if (f.length) items.push({ area, id, label: name(b[id], id), change: 'changed', fields: f }); }
    }
  };
  walk('Season', prod.seasons, box.seasons, SEASON_FIELDS);
  walk('Pack', prod.packs, box.packs, PACK_FIELDS);

  for (const packId of [...new Set([...Object.keys(prod.cards), ...Object.keys(box.cards)])].sort()) {
    const packName = name(box.packs[packId] ?? prod.packs[packId], packId);
    const p = new Map((prod.cards[packId] ?? []).map(c => [String(c.id ?? c.number), c]));
    const b = new Map((box.cards[packId] ?? []).map(c => [String(c.id ?? c.number), c]));
    for (const id of [...new Set([...p.keys(), ...b.keys()])]) {
      const label = `${name(b.get(id) ?? p.get(id), id)} (${packName})`;
      if (!b.has(id)) items.push({ area: 'Card', id: `${packId}:${id}`, label, change: 'removed', fields: [] });
      else if (!p.has(id)) items.push({ area: 'Card', id: `${packId}:${id}`, label, change: 'added', fields: [] });
      else { const f = fieldDiff(p.get(id), b.get(id), CARD_FIELDS); if (f.length) items.push({ area: 'Card', id: `${packId}:${id}`, label, change: 'changed', fields: f }); }
    }
  }

  for (const key of SETTING_KEYS) {
    const f = settingDiff(prod.settings[key], box.settings[key]);
    if (f.length) items.push({ area: 'Setting', id: key, label: key, change: 'changed', fields: f });
  }
  return items;
}

/** Counts by change type, for the summary tiles. */
export function summarizeDiff(items: DiffItem[]): { added: number; removed: number; changed: number; total: number } {
  const n = { added: 0, removed: 0, changed: 0, total: items.length };
  for (const i of items) n[i.change]++;
  return n;
}

/** Reads a whole setup through a key reader (production's, or a sandbox's). */
export async function readSetup(read: (key: string) => Promise<unknown>): Promise<Setup> {
  const seasonIds = ((await read('seasons:list')) as string[] | null) ?? [];
  const packIds = ((await read('packs:list')) as string[] | null) ?? [];
  const setup: Setup = { seasons: {}, packs: {}, cards: {}, settings: {} };
  await Promise.all([
    ...seasonIds.map(async id => { const v = await read(`season:${id}`); if (v) setup.seasons[id] = v as Record<string, unknown>; }),
    ...packIds.map(async id => {
      const [pack, cards] = await Promise.all([read(`pack:${id}`), read(`pack:${id}:cards`)]);
      if (pack) setup.packs[id] = pack as Record<string, unknown>;
      if (Array.isArray(cards)) setup.cards[id] = cards as Record<string, unknown>[];
    }),
    ...SETTING_KEYS.map(async k => { const v = await read(k); if (v !== null && v !== undefined) setup.settings[k] = v; }),
  ]);
  return setup;
}

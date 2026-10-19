import { kv } from './db';
import { getPackCards, listAllPacks } from './kv';
import { ACHIEVEMENT_KINDS } from './achievement-settings';
import { normalizeBuffDef, type ActiveBuff, type BuffDef, type BuffUsage } from './buffs-core';

export type { BuffUsage };

// KV storage for Trainer card buff definitions (`trainer:buffs`) and active community buffs (`buffs:community`).

const DEFS_KEY = 'trainer:buffs';
const COMMUNITY_KEY = 'buffs:community';

export async function getBuffDefs(): Promise<BuffDef[]> {
  try {
    const raw = await kv.get<unknown[]>(DEFS_KEY);
    if (!Array.isArray(raw)) return [];
    const out: BuffDef[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      const def = normalizeBuffDef(item);
      if (def && !seen.has(def.id)) {
        seen.add(def.id);
        out.push(def);
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function getBuffDef(id: string): Promise<BuffDef | null> {
  const all = await getBuffDefs();
  return all.find(b => b.id === id) ?? null;
}

export async function saveBuffDefs(defs: BuffDef[]): Promise<void> {
  const clean: BuffDef[] = [];
  const seen = new Set<string>();
  for (const d of defs) {
    const c = normalizeBuffDef(d);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      clean.push(c);
    }
  }
  await kv.set(DEFS_KEY, clean);
}

export async function upsertBuffDef(def: BuffDef): Promise<BuffDef[]> {
  const clean = normalizeBuffDef(def);
  if (!clean) throw new Error('Invalid buff definition.');
  const existing = await getBuffDefs();
  const idx = existing.findIndex(b => b.id === clean.id);
  const next = idx >= 0 ? existing.map((b, i) => (i === idx ? clean : b)) : [...existing, clean];
  await saveBuffDefs(next);
  return next;
}

/** Finds every card in any pack and any achievement in `achievements:settings` that references `buffId`. */
export async function findBuffUsage(buffId: string): Promise<BuffUsage> {
  const packs = await listAllPacks();
  const cards: BuffUsage['cards'] = [];
  await Promise.all(
    packs.map(async p => {
      const packCards = await getPackCards(p.id);
      for (const c of packCards) {
        if (c.kind === 'trainer' && c.buffId === buffId) {
          cards.push({ packId: p.id, packName: p.name, cardId: c.id, cardNumber: c.number, cardName: c.name });
        }
      }
    }),
  );

  const achievements: BuffUsage['achievements'] = [];
  try {
    const rawAch = await kv.get<Record<string, unknown>>('achievements:settings');
    if (rawAch && typeof rawAch === 'object') {
      for (const [kind, row] of Object.entries(rawAch)) {
        if (row && typeof row === 'object' && (row as Record<string, unknown>).buffId === buffId) {
          const found = ACHIEVEMENT_KINDS.find(k => k.kind === kind);
          achievements.push({ kind, label: found?.label ?? kind });
        }
      }
    }
  } catch { /* ignore */ }

  return { cards, achievements };
}

/**
 * Deletes a buff definition by id. Refuses deletion while any trainer card or achievement setting still points at it.
 */
export async function deleteBuffDef(buffId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const usage = await findBuffUsage(buffId);
  if (usage.cards.length > 0 || usage.achievements.length > 0) {
    const parts: string[] = [];
    if (usage.cards.length > 0) {
      parts.push(`${usage.cards.length} card${usage.cards.length === 1 ? '' : 's'} (${usage.cards.map(c => `#${c.cardNumber} ${c.cardName || 'Untitled'} in ${c.packName}`).join(', ')})`);
    }
    if (usage.achievements.length > 0) {
      parts.push(`${usage.achievements.length} achievement${usage.achievements.length === 1 ? '' : 's'} (${usage.achievements.map(a => a.label).join(', ')})`);
    }
    return {
      ok: false,
      message: `Cannot delete this buff while it is still used by ${parts.join(' and ')}.`,
    };
  }
  const existing = await getBuffDefs();
  await saveBuffDefs(existing.filter(b => b.id !== buffId));
  return { ok: true };
}

// ── Community buffs (`buffs:community`) ──────────────────
// Stored once at `buffs:community`, never copied onto every user.

export async function getCommunityBuffs(): Promise<ActiveBuff[]> {
  try {
    const raw = await kv.get<ActiveBuff[]>(COMMUNITY_KEY);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export async function saveCommunityBuffs(buffs: ActiveBuff[]): Promise<void> {
  if (buffs.length === 0) await kv.del(COMMUNITY_KEY);
  else await kv.set(COMMUNITY_KEY, buffs);
}

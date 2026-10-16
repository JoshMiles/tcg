import { kv } from './db';
import { isDefaultCardBack, resolveCardBack, sanitizeCardBack, type CardBackStyle } from './card-back';
import type { Pack } from './types';

// A pack's designed back, in its own key so the pack forms that rewrite the whole Pack never touch it. No key = the classic look.
const key = (packId: string) => `pack:${packId}:cardback`;

/** The stored design, or null when the pack has none (the classic plate). Never throws: a read failure falls back to the classic look. */
export async function getCardBack(packId: string): Promise<CardBackStyle | null> {
  try {
    const raw = await kv.get<unknown>(key(packId));
    return raw ? sanitizeCardBack(raw) : null;
  } catch {
    return null;
  }
}

/** Stores a design (a design equal to the default removes the key). Returns what was stored. */
export async function saveCardBack(packId: string, input: unknown): Promise<CardBackStyle> {
  const style = sanitizeCardBack(input);
  if (isDefaultCardBack(style)) await kv.del(key(packId));
  else await kv.set(key(packId), style);
  return style;
}

export async function deleteCardBack(packId: string): Promise<void> {
  await kv.del(key(packId));
}

/** The design for prints of `pack` in `seasonName`, ready for `FlipBack.style` (undefined = classic). */
export async function cardBackFor(pack: Pick<Pack, 'id' | 'name' | 'coverImageUrl'>, seasonName?: string): Promise<CardBackStyle | undefined> {
  return resolveCardBack(await getCardBack(pack.id), { packName: pack.name, seasonName, cover: pack.coverImageUrl });
}

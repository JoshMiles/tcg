// Pronouns shown after a collector's name (pure, client-safe). A viewer picks one of three modes: nothing (the default for
// everyone), a choice from a fixed list, or "from pr.alejo.io" (the pronouns they set for Twitch chat, fetched on the server by
// lib/pronouns-store.ts). No free text, so nothing here needs moderating.

export type PronounMode = 'none' | 'set' | 'alejo';
export interface Pronouns { mode: PronounMode; value?: string }

export const DEFAULT_PRONOUNS: Pronouns = { mode: 'none' };

/** The fixed list a viewer can pick from (the set pr.alejo.io offers, as pairs, plus any / ask me / other). */
export const PRONOUN_CHOICES = [
  { id: 'hehim', label: 'he/him' }, { id: 'sheher', label: 'she/her' }, { id: 'theythem', label: 'they/them' },
  { id: 'hethey', label: 'he/they' }, { id: 'shethey', label: 'she/they' }, { id: 'theyhe', label: 'they/he' }, { id: 'theyshe', label: 'they/she' },
  { id: 'any', label: 'any' }, { id: 'itits', label: 'it/its' }, { id: 'askme', label: 'ask me' }, { id: 'other', label: 'other' },
] as const;
export const PRONOUN_MODE_LABELS: Record<PronounMode, string> = { none: 'Do not show pronouns', set: 'Choose from a list', alejo: 'Use the ones I set on pr.alejo.io' };

export const pronounLabel = (id: string | undefined): string | null => PRONOUN_CHOICES.find(c => c.id === id)?.label ?? null;

/** Anything → valid pronouns: an unknown mode is 'none', and a value is kept only for 'set' and only from the list. */
export function sanitizePronouns(input: unknown): Pronouns {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (o.mode === 'alejo') return { mode: 'alejo' };
  if (o.mode === 'set' && typeof o.value === 'string' && PRONOUN_CHOICES.some(c => c.id === o.value)) return { mode: 'set', value: o.value };
  return { mode: 'none' };
}

/** What pr.alejo.io knows about one pronoun (the /v1/pronouns table is keyed by id). */
export interface AlejoPronoun { name: string; subject: string; object: string; singular: boolean }
/** What pr.alejo.io knows about one user (/v1/users/<login>; a 404 when they have set none). */
export interface AlejoUser { pronoun_id?: string | null; alt_pronoun_id?: string | null }

/** "he/him", "he/they" (a second pronoun), "any" (a single-word pronoun), from pr.alejo.io's ids. Null when nothing usable. */
export function alejoLabel(user: AlejoUser | null | undefined, table: Record<string, AlejoPronoun> | null | undefined): string | null {
  const main = user?.pronoun_id ? table?.[user.pronoun_id] : undefined;
  if (!main) return null;
  const alt = user?.alt_pronoun_id ? table?.[user.alt_pronoun_id] : undefined;
  const part = (s: unknown) => (typeof s === 'string' ? s.trim().toLowerCase().slice(0, 12) : '');
  const first = part(main.subject);
  if (!first) return null;
  const second = alt ? part(alt.subject) : main.singular ? '' : part(main.object);
  return second ? `${first}/${second}` : first;
}

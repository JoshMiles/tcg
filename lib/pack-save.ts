// Saving a change set from the pack workspace (ROADMAP 20.2a). No authentication here: app/admin/workspace-actions.ts checks the caller
// first. Split out so a script can test the revision check, the held-number rules and the audit entry against the mock KV.
import { recordAudit } from './audit';
import { heldCardNumbers } from './card-held';
import { getPack, getPackCards, getPackRev, savePack, savePackCards } from './kv';
import { applyChanges, reviewLines, workOf, type ChangeSet, type Work } from './pack-editor-core';
import type { Pack } from './types';

export interface WorkspaceState { work: Work; rev: number; held: number[]; status: Pack['status']; archived: boolean }

export type SaveResult =
  | { ok: true; state: WorkspaceState; assigned: Record<string, number>; changed: number }
  | { ok: false; kind: 'conflict' | 'invalid' | 'held' | 'missing'; message: string; problems?: { id: string; name: string; messages: string[] }[] };

export async function loadWorkspaceState(packId: string): Promise<WorkspaceState | null> {
  const pack = await getPack(packId);
  if (!pack) return null;
  const [cards, rev, held] = await Promise.all([getPackCards(packId), getPackRev(packId), heldCardNumbers(packId).catch(() => new Set<number>())]);
  return { work: workOf(pack, cards), rev, held: [...held], status: pack.status, archived: !!pack.archived };
}

/**
 * Saves a change set against revision `rev`. Refuses when someone saved since (`conflict`), when a card viewers hold would be renumbered, or
 * (published packs only) when a touched card fails its checks. Removing a card viewers hold needs `confirmHeld`.
 */
export async function savePackChangesCore(packId: string, rev: number, changes: ChangeSet, opts: { confirmHeld?: boolean } = {}): Promise<SaveResult> {
  const pack = await getPack(packId);
  if (!pack) return { ok: false, kind: 'missing', message: 'This pack no longer exists.' };
  if (rev !== (await getPackRev(packId))) return { ok: false, kind: 'conflict', message: 'Someone else saved this pack since you opened it.' };
  const cards = await getPackCards(packId);

  const renumbered = Object.entries(changes.update).filter(([id, u]) => u.number !== undefined && u.number !== cards.find(c => c.id === id)?.number);
  const removing = cards.filter(c => changes.remove.includes(c.id));
  if (renumbered.length > 0 || removing.length > 0) {
    const held = await heldCardNumbers(packId);
    const stuck = renumbered.map(([id]) => cards.find(c => c.id === id)).filter(c => c && held.has(c.number));
    if (stuck.length > 0) return { ok: false, kind: 'held', message: `${stuck.map(c => `#${c!.number}`).join(', ')} ${stuck.length === 1 ? 'has' : 'have'} been pulled by viewers, so the number can't change.` };
    const heldGone = removing.filter(c => held.has(c.number));
    if (heldGone.length > 0 && !opts.confirmHeld) return { ok: false, kind: 'held', message: `${heldGone.map(c => `#${c.number} ${c.name}`).join(', ')} ${heldGone.length === 1 ? 'is' : 'are'} held by viewers. Confirm to delete anyway.` };
  }

  const applied = applyChanges(pack, cards, changes);
  // A draft may be unfinished (autosave keeps whatever is there); a published pack is live, so a touched card must pass its checks.
  if (pack.status !== 'draft' && applied.problems.length > 0) return { ok: false, kind: 'invalid', message: 'Fix these before saving.', problems: applied.problems };

  if (Object.keys(changes.pack).length > 0) await savePack(applied.pack);
  if (changes.add.length > 0 || Object.keys(changes.update).length > 0 || changes.remove.length > 0) await savePackCards(packId, applied.cards);
  const lines = reviewLines(workOf(pack, cards), workOf(applied.pack, applied.cards));
  if (pack.status !== 'draft' && lines.length > 0) {
    await recordAudit(`pack:${packId}`, 'Pack edited', `${pack.name}: ${lines.slice(0, 6).map(l => `${l.scope} ${l.field}`).join('; ')}${lines.length > 6 ? ` and ${lines.length - 6} more` : ''}`);
  }
  return { ok: true, state: (await loadWorkspaceState(packId))!, assigned: applied.assigned, changed: lines.length };
}

'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { loadWorkspaceState, savePackChangesCore, type SaveResult, type WorkspaceState } from '@/lib/pack-save';
import type { ChangeSet } from '@/lib/pack-editor-core';

// The pack workspace's server side (ROADMAP 20.2a). One action saves a whole change set; the same `applyChanges` the workspace uses
// builds the result, so what you reviewed is what is stored. The logic is in lib/pack-save.ts.

/** The pack as saved now (for "Load their version"). */
export async function loadPackWorkspace(packId: string): Promise<WorkspaceState | null> {
  await requireAdmin();
  return loadWorkspaceState(packId);
}

export async function savePackChanges(packId: string, rev: number, changes: ChangeSet, opts: { confirmHeld?: boolean } = {}): Promise<SaveResult> {
  await requireAdmin();
  const r = await savePackChangesCore(packId, rev, changes, opts);
  if (r.ok && r.state.status !== 'draft' && r.changed > 0) { revalidatePath('/admin/packs'); revalidatePath('/cards'); }
  return r;
}

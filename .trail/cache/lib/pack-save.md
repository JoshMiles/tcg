# lib/pack-save.ts

- WorkspaceState · interface · L9-L9 — interface WorkspaceState
- SaveResult · type · L11-L13 — type SaveResult = | { ok: true; state: WorkspaceState; assigned: Record<string, number>; changed: number } | { ok: false; kind: 'conflict' | 'invalid' | 'held' | 'missing'; message: string; problems?: { id: string; name: string; messages: string[] }[] };
- loadWorkspaceState · function · L15-L20 — async function loadWorkspaceState(packId: string): Promise<WorkspaceState | null>
- savePackChangesCore · function · L26-L53 — async function savePackChangesCore(packId: string, rev: number, changes: ChangeSet, opts: { confirmHeld?: boolean } = {}): Promise<SaveResult>

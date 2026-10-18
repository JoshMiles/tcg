# app/admin/mixitup/commands-actions.ts

- SaveResult · type · L7-L7 — type SaveResult = { ok: true; commands: ChatCommand[] } | { ok: false; message: string };
- saveCommandsAction · function · L10-L19 — async function saveCommandsAction(json: string): Promise<SaveResult>
- tryCommandAction · function · L22-L31 — async function tryCommandAction(draftJson: string, username: string, args: string): Promise<{ json: string }>

# app/admin/settings/actions.ts

- previewScoringAction · function · L18-L26 — async function previewScoringAction(raw: Record<string, string>): Promise<{ ok: true; season: string; preview: ScoringPreview } | { ok: false; message: string }>
- backfillSerialsAction · function · L29-L38 — async function backfillSerialsAction(seasonId: string): Promise<void>
- seedPreviewAction · function · L41-L46 — async function seedPreviewAction(formData: FormData): Promise<void>
- wipePreviewAction · function · L49-L54 — async function wipePreviewAction(): Promise<void>
- backupNowAction · function · L57-L67 — async function backupNowAction(): Promise<void>

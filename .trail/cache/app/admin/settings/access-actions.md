# app/admin/settings/access-actions.ts

- back · function · L8-L8 — back = (kind: 'saved' | 'error' | 'note', text: string): never
- saveAccessAction · function · L11-L19 — async function saveAccessAction(formData: FormData): Promise<void>
- addTesterAction · function · L22-L27 — async function addTesterAction(formData: FormData): Promise<void>
- removeTesterAction · function · L30-L36 — async function removeTesterAction(login: string): Promise<{ ok: boolean; message: string }>
- setUserTesterAction · function · L39-L45 — async function setUserTesterAction(login: string, tier: string): Promise<{ ok: boolean; message: string }>

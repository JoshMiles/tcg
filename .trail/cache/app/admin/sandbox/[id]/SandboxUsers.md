# app/admin/sandbox/[id]/SandboxUsers.tsx

- Sort · type · L9-L9 — type Sort = 'copies' | 'rank' | 'name' | 'new';
- SandboxUsers · function · L13-L101 — function SandboxUsers({ id, rows, loginAs, clear, remove }: { id: string; rows: SandboxUserRow[]; loginAs: (f: FormData) => Promise<void>; clear: (f: FormData) => Promise<void>; remove: (f: FormData) => Promise<void>; })
- toggle · function · L34-L34 — toggle = (u: string)

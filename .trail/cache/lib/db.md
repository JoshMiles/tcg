# lib/db.ts

- isPreview · function · L30-L30 — isPreview = ()
- runInSandbox · function · L35-L37 — function runInSandbox<T>(id: string | null, fn: () => T): T
- sandboxExists · function · L40-L46 — async function sandboxExists(id: string): Promise<boolean>
- forgetSandboxCache · function · L48-L48 — function forgetSandboxCache()
- currentSandboxId · function · L51-L64 — async function currentSandboxId(): Promise<string | null>
- inSandbox · function · L67-L69 — async function inSandbox(): Promise<boolean>
- prefixed · function · L79-L79 — prefixed = (id: string, key: unknown)
- Kv · type · L81-L81 — type Kv = typeof prodKv;
- get · method · L93-L106 — get(target, prop)
- get · method · L111-L121 — get(target, prop)

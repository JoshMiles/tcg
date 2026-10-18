// lib/site.ts reads process.env at import time; give the browser bundle an empty env so it falls back to its defaults.
const g = globalThis as { process?: { env: Record<string, string | undefined> } };
if (!g.process) g.process = { env: {} };
export {};

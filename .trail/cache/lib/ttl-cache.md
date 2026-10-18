# lib/ttl-cache.ts

- TtlCache · interface · L5-L10 — interface TtlCache<T>
- createTtlCache · function · L12-L38 — function createTtlCache<T>(ttlMs: number, now: () => number = Date.now, maxEntries = 50): TtlCache<T>
- get · method · L17-L34 — async get(key, compute)
- clear · method · L35-L35 — clear()
- size · method · L36-L36 — size()

// A tiny in-memory cache with a time limit, for expensive public reads (the season leaderboard) that many visitors ask for at once.
// It lives in one server instance's memory, so it only softens bursts: a fresh instance starts empty, which is fine. In-flight
// work is shared, so ten simultaneous visitors cause one computation, not ten. Pure (no framework imports); the clock is injectable.

export interface TtlCache<T> {
  /** The cached value for `key`, or computes it (once, even for concurrent callers) and keeps it for the TTL. */
  get(key: string, compute: () => Promise<T>): Promise<T>;
  clear(): void;
  size(): number;
}

export function createTtlCache<T>(ttlMs: number, now: () => number = Date.now, maxEntries = 50): TtlCache<T> {
  const done = new Map<string, { at: number; value: T }>();
  const pending = new Map<string, Promise<T>>();

  return {
    async get(key, compute) {
      const hit = done.get(key);
      if (hit && now() - hit.at < ttlMs) return hit.value;
      const running = pending.get(key);
      if (running) return running;
      const p: Promise<T> = compute().then(
        value => {
          // A clear() while this ran dropped it from `pending`: its value may predate the write that cleared, so it is not kept.
          if (pending.get(key) !== p) return value;
          done.set(key, { at: now(), value });
          // Keep the map small: drop the oldest when over the limit.
          if (done.size > maxEntries) done.delete(done.keys().next().value as string);
          pending.delete(key);
          return value;
        },
        err => { if (pending.get(key) === p) pending.delete(key); throw err; }, // a failure is never cached
      );
      pending.set(key, p);
      return p;
    },
    clear() { done.clear(); pending.clear(); },
    size() { return done.size; },
  };
}

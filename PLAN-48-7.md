# PLAN 48.7: each viewer's cards under their own field (hash per season)

Decided (Josh, 2026-10-26): build now; migrate automatically on first use; keep the old blob 30 days as a rollback copy. Findings: admin E-2, public-site C-5 (docs/archive/audit-2026-*.md).

## Today
One KV string `tcg_<collectionName>` per season = `Record<login, number[]>`. Every pull, trade, upgrade, trainer use and admin edit reads and rewrites the whole value under `withCollectionLock` (`lock:tcg_<c>`). Single-viewer pages (account, trade pages, holdings, the panel's collection) download the whole value too. Data health (`lib/data-health.ts` `summarizeCollection`) reports bytes, viewers and the largest viewer per season.

## Storage
- Hash `coll:<collectionName>`: field = lowercase login, value = that viewer's `number[]` (JSON). A viewer with no cards has no field.
- After migration the old string is renamed `tcg_<collectionName>:old` and kept 30 days (rollback, see below). Nothing reads it.

## API (lib/kv.ts)
- `getCollection(c)`: `HGETALL`, same `Record<login, number[]>` return shape. The 16 whole-collection readers (leaderboard, season wrap, dashboard, data health, card-held, print of the week, site search, sandbox log, commands, feedback, user-admin `knownViewer`, sandbox tools, admin serials page, backfill, `/api/collection` GET, `getAllCollectionUsers`) do not change.
- `getUserCards(c, login): Promise<number[]>`: `HGET`. For the single-viewer readers (PR B).
- `updateCollection(c, logins: string[], fn: (cards: Record<login, number[]>) => Record<login, number[]> | Promise<...>, ctx?: SyncContext)`: under the existing collection lock, `HMGET` those logins, call `fn` with a record holding only them (missing = `[]`), run the serial sync for those logins only (before/after restricted to them), then `HSET` changed fields and `HDEL` emptied ones. Returns what `fn` returned plus whatever the callers need (match the existing helpers' return values).
- `saveCollection(c, data, ctx?)` stays for the whole-collection writers (sandbox undo / scenarios / seed / remove test users, legacy import, `/api/collection` admin full replace, `deleteCollection`): diff against `HGETALL`, `HSET` changed, `HDEL` removed, serial sync as today. Must be called under the lock (learning: every whole-collection write goes through `withCollectionLock`).
- Lock: unchanged (`withCollectionLock`, same key, same lock-order rule in lib/trades.ts: trades lock before collection locks). Hold time drops to a 1 to 2 field read and write. Per-viewer locks were ruled out: mixing them with whole-collection writers is complex and unnecessary at this size.

## Writers to switch to `updateCollection` (PR A)
`addCollectionEntry`, `addCollectionEntryWithSerial`, `removeUserFromCollection` (lib/kv.ts); `useTrainerCard` (lib/buffs.ts); `returnToCollection`, `createInLock`, `acceptTrade`, `reverseTrade` (lib/trades.ts); `upgradeCard` (lib/upgrade.ts); `restoreUserSnapshot`, `mergeUsers` (lib/user-admin.ts); `removeUserCard` (app/admin/actions/users.ts); `transferCopyAction`, `removeCopyAction` (app/admin/serial-actions.ts); the account move collections step (lib/account-move.ts, today a raw `kv.set` of the blob: becomes a per-field move `HGET from` / `HSET to` merge / `HDEL from`, still no retire/mint, plus the ledger rename as today). Check `lib/trades.ts` for the other read-modify-write spots (around lines 308 and 569) and switch them too.

## Direct key use to update
- `lib/trade-ledger-audit.ts:297` raw read: use `getCollection`.
- `lib/sandbox.ts:80` copies `tcg_<c>` into a sandbox: copy `coll:<c>` (a hash; check `copyKey` handles hashes, or ensure the source is migrated first).
- `lib/sandbox.ts:133` reset pattern `tcg_*`: also `coll:*`.
- `lib/backup.ts` scans `*` (keeps `coll:*`); confirm `restoreEntries` writes hashes back (`HSET`) and `isBackedUp` does not drop `coll:` or `tcg_*:old`; exclude `:old` from backups if simple.
- `lib/db.ts` sandbox-namespaced kv: add any new commands used (`hmget` is in; `rename`, `exists`, `hlen` if used) with both keys prefixed for `rename`.
- `scripts/mock-kv.cjs`: add `rename` (and anything else used). Scripts that build `tcg_` keys directly (check-backup, check-sandbox*, check-data-health, check-season-snapshot) move to the new layout.

## Migration (automatic on first use)
- `ensureMigrated(c)`: per-instance memo (a Set of migrated collection names; only `true` is remembered). If `EXISTS coll:<c>` is true, remember and return. Otherwise, under `withCollectionLock(c)`: re-check `EXISTS`; read the string `tcg_<c>`; write all fields into `coll:<c>:new` in chunks (`HSET` up to ~200 fields per call); verify `HLEN` equals the viewer count and the total entry count matches; `RENAME coll:<c>:new coll:<c>` (atomic, so a reader never sees a half-built hash); `RENAME tcg_<c> tcg_<c>:old`; record `{ c, viewers, entries, at }` in a hash `coll:migrated` (Data health). A missing string means a new or empty season: nothing to copy.
- Every reader and writer of a collection calls `ensureMigrated(c)` first (inside `getCollection`, `getUserCards`, `updateCollection`, `saveCollection`, `withCollectionLock` callers that read). One `EXISTS` per instance per collection, then free.
- Sandboxes: the same code under the sandbox prefix migrates the sandbox's own copy.
- Deploy off-stream. Concurrent first requests on two instances are serialised by the lock; the second sees the hash and skips.

## Rollback (kept 30 days)
- `tcg_<c>:old` stays until deleted from a Data health button "Delete old collection copies" (shown only when `coll:migrated` entries are older than 30 days; it deletes those `:old` keys).
- `scripts/rollback-collections.mts` (documented in docs/hosting.md, never run automatically): rebuilds `tcg_<c>` from `coll:<c>` for every season so the previous deploy can be restored. Pulls after migration are in the hash, so rebuilding from the hash (not restoring `:old`) keeps them.

## Data health
- Size summary from `getCollection` keeps working (bytes are the JSON size of the record, now an estimate of the hash).
- Show migrated seasons from `coll:migrated` and the old-copy delete button.

## Checks (`scripts/check-collection-hash.mts`, plus the existing ones updated)
- Migration: string to hash equal content; idempotent; two concurrent `ensureMigrated` calls produce one migration; a reader during migration never sees a partial hash; `:old` kept; empty season.
- `updateCollection`: only the named fields change; emptied viewer's field is deleted; serial ledger (`copies:<c>:o:<u>`, `idx`) consistent and print counts conserved across a pull, a trade (escrow and accept), an upgrade, a trainer use, an admin transfer, an account move.
- `saveCollection` whole write: diff writes and deletes; sandbox copy and reset; backup round trip with a hash.
- Existing checks (`trades`, `serials`, `account-move`, `buffs`, `upgrade`, `sandbox*`, `backup`, `data-health`, `season-snapshot`, `paid-pull-order`) all pass on the new layout.
- Measure: a pull save's KV bytes and time before and after with 300 and 3,000 seeded viewers (`seedUsers`), reported in the PR.

## PR sequence
- **PR A:** storage, `ensureMigrated`, `updateCollection` / `getUserCards` / new `saveCollection`, every writer above, the direct key uses, sandbox, backup, mock KV, Data health migration list and old-copy button, rollback script, checks, docs (data-architecture.md, serials.md, trading.md, hosting.md, sandbox.md). Commit this plan with it.
- **PR B:** the 12 single-viewer readers switch to `getUserCards` (trade pages, account, trade new, holdings API, panel `/api/twitch/trades` and `/api/twitch/collection` server side only with unchanged JSON, admin user page, account move, achievements store, showoff prepare, user export, user-admin snapshot).
- Delete this file when 48.7 ships.

## Not checkable locally
Real Upstash timings and the migration on production data; the deploy must be watched (Data health migration list right after the first request).

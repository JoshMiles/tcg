# Data architecture

> Read this when you touch how seasons, packs, cards, collections or user profiles are stored in KV.

Three tiers in Vercel KV: **Seasons → Packs → Cards**.

- **Seasons** (`season:{id}`, index `seasons:list`): metadata + `packIds: string[]`. One season active at a time.
- **Packs** (`pack:{id}`, index `packs:list`): global, not owned by a season; one pack can be in several seasons. Cards live at `pack:{id}:cards`.
- **Legacy collection** (`tcg_{collectionName}`): `{ username: number[] }`. **The source of truth for user data**, written by the overlay via `/api/collection`. Duplicates are intentional: each entry is one pull. Unique count is `new Set(array).size`; everywhere that shows cards builds a `Map<number, count>` and shows a `×N` badge when count > 1.
- **User profiles** (`user:{username}:profile`) and **Twitch opaque mapping** (`twitch_opaque:{opaqueId}` → lowercase username). Sign-in also records the Twitch account behind each login (`lib/account-bind.ts`): the hash `acct:ids` (Twitch ID → login, written once) and the hash `acct:conflicts` (login → `{ storedId, newId, seen, count }`, when a different account signed in on a login whose profile holds another ID; recorded only, the profile is not changed). Both go through the sandbox-aware `kv`, and a sandbox sign-in records neither.
- Users are read with `getAllCollectionUsers()` in `lib/kv.ts` (aggregates every season's legacy collection).
- `normalizeSeason` / `normalizePack` in `lib/kv.ts` handle legacy shapes on read, so KV never needs manual migrations.

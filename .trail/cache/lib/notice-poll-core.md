# lib/notice-poll-core.ts

- parseSince · function · L9-L12 — function parseSince(raw: string | null | undefined): number | null
- isUnchanged · function · L15-L17 — function isUnchanged(since: number | null, version: number): boolean
- pollDelay · function · L20-L23 — function pollDelay(hidden: boolean, idleMs: number): number | null
- titleWithCount · function · L26-L29 — function titleWithCount(title: string, unread: number): string
- freshNotices · function · L32-L34 — function freshNotices<T extends { id: string; at: number }>(notices: T[], seen: number, announced: Set<string>): T[]

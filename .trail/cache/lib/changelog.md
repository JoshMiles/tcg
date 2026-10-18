# lib/changelog.ts

- ChangeTag · type · L7-L7 — type ChangeTag = 'new' | 'improved' | 'fixed';
- ChangelogEntry · interface · L9-L19 — interface ChangelogEntry
- newestChangelogDate · function · L184-L186 — function newestChangelogDate(entries: ChangelogEntry[] = CHANGELOG): string
- hasUnseenChanges · function · L189-L191 — function hasUnseenChanges(seen: string | null | undefined, newest: string = newestChangelogDate()): boolean

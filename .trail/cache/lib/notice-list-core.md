# lib/notice-list-core.ts

- NoticeFilter · type · L5-L5 — type NoticeFilter = 'all' | 'unread' | 'offers' | 'results' | 'alerts' | 'admin';
- matchesFilter · function · L11-L20 — function matchesFilter(n: Notice, filter: NoticeFilter, seen: number): boolean
- dayLabel · function · L23-L29 — function dayLabel(at: number, now = Date.now()): string
- day · function · L24-L24 — day = (t: number)
- groupByDay · function · L32-L40 — function groupByDay(notices: Notice[], now = Date.now()): { label: string; items: Notice[] }[]
- timeLabel · function · L43-L43 — timeLabel = (at: number): string

# app/admin/seasons/season-timing.ts

- rel · function · L3-L9 — rel = (ms: number)
- seasonTiming · function · L12-L18 — function seasonTiming(s: Pick<Season, 'startsAt' | 'endsAt' | 'endedAt' | 'active' | 'autoStart' | 'status'>, now = Date.now()): { label: string; tone: 'soon' | 'info' } | null

# app/admin/components/PageTabs.tsx

- PageTab · type · L4-L4 — type PageTab = { id: string; label: string; icon?: IconName; count?: number | string; hint?: string };
- PageTabs · function · L10-L37 — function PageTabs({ tabs, active, base, keep, label = 'Page sections' }: { tabs: readonly PageTab[]; active: string; base: string; keep?: Record<string, string | undefined>; label?: string; })
- href · function · L13-L18 — href = (id: string)
- pickTab · function · L40-L42 — function pickTab<T extends string>(tabs: readonly { id: T }[], raw: string | undefined): T

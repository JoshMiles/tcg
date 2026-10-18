# lib/sandbox-diff.ts

- Setup · interface · L4-L9 — interface Setup
- DiffArea · type · L11-L11 — type DiffArea = 'Season' | 'Pack' | 'Card' | 'Setting';
- FieldChange · interface · L12-L12 — interface FieldChange
- DiffItem · interface · L13-L13 — interface DiffItem
- show · function · L20-L24 — show = (v: unknown): string
- same · function · L25-L25 — same = (a: unknown, b: unknown)
- fieldDiff · function · L27-L31 — function fieldDiff(prod: Record<string, unknown> | undefined, box: Record<string, unknown> | undefined, fields: string[]): FieldChange[]
- settingDiff · function · L34-L39 — function settingDiff(prod: unknown, box: unknown): FieldChange[]
- diffSetup · function · L41-L72 — function diffSetup(prod: Setup, box: Setup): DiffItem[]
- name · function · L43-L43 — name = (r: Record<string, unknown> | undefined, fallback: string)
- walk · function · L45-L51 — walk = (area: DiffArea, p: Record<string, Record<string, unknown>>, b: Record<string, Record<string, unknown>>, fields: string[])
- summarizeDiff · function · L75-L79 — function summarizeDiff(items: DiffItem[]): { added: number; removed: number; changed: number; total: number }
- readSetup · function · L82-L96 — async function readSetup(read: (key: string) => Promise<unknown>): Promise<Setup>

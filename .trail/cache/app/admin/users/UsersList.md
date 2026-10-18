# app/admin/users/UsersList.tsx

- UserRow · interface · L11-L31 — interface UserRow
- SortKey · type · L33-L33 — type SortKey = 'cards' | 'score' | 'pulls' | 'active' | 'joined' | 'trades' | 'name';
- chip · function · L41-L41 — chip = (on: boolean)
- ago · function · L43-L52 — function ago(at: number | null, now: number): string
- csvCell · function · L54-L54 — csvCell = (v: string | number | null)
- UsersList · function · L60-L245 — function UsersList({ rows, allTags, activeSeason }: { rows: UserRow[]; allTags: string[]; activeSeason: string | null })
- clear · function · L106-L106 — clear = ()
- toggleAll · function · L108-L108 — toggleAll = ()
- toggleOne · function · L109-L109 — toggleOne = (u: string)
- run · function · L112-L115 — run = (fn: () => Promise<{ ok: boolean; message: string }>)
- exportCsv · function · L117-L125 — exportCsv = ()

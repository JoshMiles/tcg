# app/admin/components/card-back/Properties.tsx

- chip · function · L11-L11 — chip = (on: boolean)
- Group · function · L13-L15 — function Group({ title, children }: { title: string; children: ReactNode })
- Row · function · L16-L18 — function Row({ label, children }: { label: string; children: ReactNode })
- Num · function · L19-L27 — function Num({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void })
- Check · function · L28-L30 — function Check({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void })
- Colour · function · L32-L43 — function Colour({ label, value, onChange, named = [] }: { label: string; value: string; onChange: (v: string) => void; named?: string[] })
- Properties · function · L46-L141 — function Properties({ style, selection, boxes, cardW, onChange }: { style: CardBackStyle; selection: Set<string>; boxes: Record<string, Box & { fontPx: number }>; cardW: number; onChange: (next: CardBackStyle, key?: string) => void; })
- set · function · L58-L58 — set = (patch: Partial<BackEl>, key?: string)
- fx · function · L59-L59 — fx = (patch: Partial<Effects>, key?: string)
- toFree · function · L62-L62 — toFree = ()
- BackgroundPanel · function · L143-L178 — function BackgroundPanel({ style, onChange }: { style: CardBackStyle; onChange: (next: CardBackStyle, key?: string) => void })
- set · function · L144-L144 — set = (patch: Parameters<typeof patchBackground>[1], key?: string)

# app/admin/serials/page.tsx

- when · function · L28-L28 — when = (t: number)
- SP · type · L31-L31 — type SP = { done?: string; err?: string; season?: string; card?: string; v?: string; variant?: string; holder?: string; origin?: string; q?: string; page?: string; print?: string };
- SerialsPage · function · L33-L304 — async function SerialsPage({ searchParams }: { searchParams: Promise<SP> })
- cardOf · function · L63-L63 — cardOf = (n: number)
- nameOf · function · L64-L64 — nameOf = (n: number)
- mk · function · L73-L78 — mk = (o: Record<string, string | undefined>)
- firstVariant · function · L106-L106 — firstVariant = (n: number): Variant
- chip · function · L134-L151 — chip = (r: Copy, withName: boolean)

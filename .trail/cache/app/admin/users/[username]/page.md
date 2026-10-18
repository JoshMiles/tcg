# app/admin/users/[username]/page.tsx

- generateMetadata · function · L35-L38 — async function generateMetadata({ params }: { params: Promise<{ username: string }> })
- SeasonEntry · type · L40-L46 — type SeasonEntry = { season: Season; ownedNumbers: number[]; countMap: Map<number, number>; variantMap: Map<number, ReturnType<typeof countVariants> extends Map<number, infer V> ? V : never>; packs: Array<{ pack: Pack; cards: Card[] }>; };
- ago · function · L48-L55 — function ago(t: number | null | undefined, now: number): string
- UserDetailPage · function · L57-L431 — async function UserDetailPage({ params, searchParams, }: { params: Promise<{ username: string }>; searchParams: Promise<{ compare?: string; tab?: string }>; })
- nameOf · function · L114-L114 — nameOf = (n: number)
- seasonName · function · L127-L127 — seasonName = (id: string)
- toLine · function · L128-L134 — toLine = (t: (typeof trades.outgoing)[number], open: boolean): TradeLine

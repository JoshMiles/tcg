# lib/profile-data.ts

- ShowcaseCard · interface · L27-L27 — interface ShowcaseCard
- topCopies · function · L30-L40 — function topCopies(allCards: { number: number; name: string; imageUrl: string; fullArtImageUrl?: string; stars: number }[], variantMap: Map<number, VariantCounts>, values: Map<number, CardValue>, n: number, serial?: { held?: Map<number, number[]>; settings: ScoringSettings }): ShowcaseCard[]
- buildShareCandidates · function · L43-L50 — function buildShareCandidates(b: ProfileBase, copies: Copy[], n = 18): ShareCard[]
- art · function · L45-L45 — art = (c: ShowcaseCard)
- buildShareBase · function · L53-L60 — function buildShareBase(b: ProfileBase, siteHost: string): Omit<ShareSpec, 'cards'>
- buildBigStats · function · L63-L69 — function buildBigStats(b: ProfileBase): BigStat[]
- buildShareSpec · function · L72-L74 — function buildShareSpec(b: ProfileBase, copies: Copy[], siteHost: string): ShareSpec
- ProfileBase · interface · L77-L100 — interface ProfileBase
- loadProfileBase · function · L106-L132 — async function loadProfileBase(lower: string, fresh: boolean): Promise<ProfileBase | null>
- serialFor · function · L135-L142 — function serialFor(b: ProfileBase, cardNumber: number): GridCard['serial']
- buildGridCards · function · L145-L186 — async function buildGridCards(b: ProfileBase, copies: Copy[] = []): Promise<GridCard[]>

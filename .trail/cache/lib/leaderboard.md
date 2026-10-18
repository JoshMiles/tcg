# lib/leaderboard.ts

- getHiddenUsersSafe · function · L12-L17 — async function getHiddenUsersSafe(): Promise<Set<string>>
- CardValue · interface · L24-L36 — interface CardValue
- LeaderboardRow · interface · L38-L53 — interface LeaderboardRow
- SeasonValues · interface · L55-L65 — interface SeasonValues
- Bonuses · interface · L67-L73 — interface Bonuses
- collectionBonuses · function · L76-L86 — function collectionBonuses(values: Pick<SeasonValues, 'totalCards' | 'setValue' | 'settings'>, uniqueCards: number): Bonuses
- copyPoints · function · L89-L92 — function copyPoints(cv: CardValue, variant: Variant, serial: number | undefined, settings: ScoringSettings): number
- HeldPoints · interface · L94-L102 — interface HeldPoints
- pointsFor · function · L105-L123 — function pointsFor(values: Pick<SeasonValues, 'cards' | 'settings' | 'serials'>, entries: number[], username?: string): HeldPoints
- variantMultiplierDetail · function · L130-L148 — function variantMultiplierDetail( pack: Pick<Pack, 'upgradesEnabled' | 'variantWeights' | 'upgradeCosts' | 'disabledVariants'>, settings: ScoringSettings = DEFAULT_SCORING, ): { multiplier: Record<Variant, number>; byOdds: Record<Variant, number>; byCost: Record<Variant, number> }
- variantMultipliers · function · L150-L155 — function variantMultipliers( pack: Pick<Pack, 'upgradesEnabled' | 'variantWeights' | 'upgradeCosts' | 'disabledVariants'>, settings: ScoringSettings = DEFAULT_SCORING, ): Record<Variant, number>
- computeSeasonValues · function · L164-L222 — function computeSeasonValues( packs: { pack: Pack; cards: Card[] }[], collection: Record<string, number[]>, settings: ScoringSettings = DEFAULT_SCORING, serials: SerialIndex | null = null, ): SeasonValues
- scoreFor · function · L225-L229 — function scoreFor(values: SeasonValues, entries: number[], username?: string): number
- projectUpgradeGain · function · L236-L268 — function projectUpgradeGain( values: SeasonValues, owned: number[], username: string, cardNumber: number, from: Variant, to: Variant, cost: number, ): number | null
- buildLeaderboard · function · L270-L291 — function buildLeaderboard(values: SeasonValues, collection: Record<string, number[]>): LeaderboardRow[]
- getSeasonLeaderboard · function · L294-L313 — async function getSeasonLeaderboard(season: Season): Promise<{ rows: LeaderboardRow[]; values: SeasonValues; packs: { pack: Pack; cards: Card[] }[]; }>
- Board · type · L315-L315 — type Board = Awaited<ReturnType<typeof getSeasonLeaderboard>>;
- getSeasonLeaderboardCached · function · L323-L326 — async function getSeasonLeaderboardCached(season: Season): Promise<Board>

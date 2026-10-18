# lib/draft-validation.ts

- Issue · interface · L4-L7 — interface Issue
- PackFields · type · L9-L9 — type PackFields = Pick<Pack, 'name' | 'upgradesEnabled' | 'variantWeights'>;
- CardFields · type · L10-L10 — type CardFields = Pick<Card, 'name' | 'imageUrl' | 'stars' | 'probability'>;
- validatePack · function · L12-L34 — function validatePack(pack: PackFields, cards: CardFields[]): Issue[]
- plural · function · L23-L23 — plural = (n: number)
- validateSeason · function · L36-L55 — function validateSeason( season: Pick<Season, 'name' | 'collectionName' | 'packIds'> & Partial<Pick<Season, 'startsAt' | 'endsAt'>>, /** Collection names used by *other* seasons, sharing one would merge two seasons' collections. */ otherCollectionNames: string[], ): Issue[]
- suggestCollectionName · function · L58-L61 — function suggestCollectionName(name: string): string

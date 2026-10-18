# lib/types.ts

- Variant · type · L2-L2 — type Variant = 'regular' | 'reverse' | 'full' | 'shiny';
- VariantWeights · type · L4-L4 — type VariantWeights = Record<Variant, number>;
- OptionalVariant · type · L7-L7 — type OptionalVariant = Exclude<Variant, 'regular'>;
- UpgradeCosts · type · L10-L10 — type UpgradeCosts = Record<Exclude<Variant, 'regular'>, number>;
- DraftStatus · type · L13-L13 — type DraftStatus = 'draft' | 'published';
- Season · interface · L15-L32 — interface Season
- Pack · interface · L34-L55 — interface Pack
- Card · interface · L57-L71 — interface Card
- UserProfile · interface · L73-L83 — interface UserProfile

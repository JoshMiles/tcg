# lib/sandbox-tools.ts

- sanitizeName · function · L12-L12 — sanitizeName = (n: string)
- cleanTestUsername · function · L14-L16 — function cleanTestUsername(input: string): string
- DrawPacks · type · L18-L18 — type DrawPacks = { pack: Pack; cards: Card[] }[];
- drawOne · function · L21-L30 — function drawOne(packs: DrawPacks): { card: Card; pack: Pack; variant: Variant }
- simulatePulls · function · L33-L52 — function simulatePulls(sandboxId: string, username: string, count: number): Promise<{ pulls: number; byVariant: VariantCounts }>
- grantCopies · function · L55-L69 — function grantCopies(sandboxId: string, username: string, cardNumber: number, variant: Variant, count: number): Promise<number>
- listSandboxUsers · function · L72-L82 — function listSandboxUsers(sandboxId: string): Promise<{ username: string; copies: number; unique: number }[]>
- listSandboxCards · function · L85-L94 — function listSandboxCards(sandboxId: string): Promise<{ number: number; name: string; pack: string; imageUrl: string; fullArtImageUrl?: string; holo: HoloSpecs }[]>
- makeNames · function · L102-L113 — function makeNames(count: number, taken: Set<string>): string[]
- SeedShape · type · L115-L115 — type SeedShape = 'realistic' | 'even';
- seedUsers · function · L122-L163 — function seedUsers( sandboxId: string | null, opts: { count: number; minPulls: number; maxPulls: number; shape: SeedShape }, ): Promise<{ users: number; pulls: number; byVariant: VariantCounts; heaviest: number }>
- listCardValues · function · L166-L186 — function listCardValues(sandboxId: string): Promise<{ number: number; name: string; stars: number; pack: string; upgrades: boolean; pullRate: number; copies: VariantCounts; values: Record<Variant, number>; }[]>
- SandboxStats · interface · L190-L190 — interface SandboxStats
- getSandboxStats · function · L193-L202 — function getSandboxStats(sandboxId: string): Promise<SandboxStats>
- SandboxUserRow · interface · L204-L204 — interface SandboxUserRow
- listSandboxUserRows · function · L207-L222 — function listSandboxUserRows(sandboxId: string): Promise<SandboxUserRow[]>
- removeTestUsers · function · L225-L241 — function removeTestUsers(sandboxId: string, usernames: string[], mode: 'clear' | 'delete'): Promise<number>

# lib/access-core.ts

- AccessMode · type · L7-L7 — type AccessMode = 'open' | 'beta' | 'alpha';
- AccessLabel · type · L8-L8 — type AccessLabel = 'none' | 'alpha' | 'beta';
- TesterTier · type · L9-L9 — type TesterTier = 'alpha' | 'beta';
- AccessTier · type · L11-L11 — type AccessTier = TesterTier | 'staff';
- AccessSettings · interface · L24-L24 — interface AccessSettings
- TesterRecord · interface · L27-L27 — interface TesterRecord
- safeParse · function · L29-L29 — function safeParse(s: string): unknown
- normalizeAccess · function · L31-L41 — function normalizeAccess(raw: unknown): AccessSettings
- sanitizeTester · function · L43-L55 — function sanitizeTester(raw: unknown): TesterRecord | null
- canEnter · function · L58-L62 — function canEnter(mode: AccessMode, tier: TesterTier | null | undefined, isStaff: boolean): boolean
- canEnterTier · function · L65-L65 — canEnterTier = (mode: AccessMode, tier: AccessTier): boolean
- bestTier · function · L68-L70 — function bestTier(isStaff: boolean, tester: TesterTier | null | undefined): AccessTier | null
- within · function · L81-L81 — within = (path: string, base: string)
- isExemptPath · function · L84-L90 — function isExemptPath(pathname: string): boolean
- isApiPath · function · L92-L92 — isApiPath = (pathname: string)

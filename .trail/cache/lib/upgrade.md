# lib/upgrade.ts

- UpgradeResult · type · L10-L12 — type UpgradeResult = | { ok: true; owned: number[]; cardName: string; from: Variant; to: Variant; cost: number; /** The serial the new copy got (null before the season's copies are numbered) and its points multiplier. */ serial: number | null; serialMult: number } | { ok: false; status: number; error: string };
- upgradeCard · function · L19-L94 — async function upgradeCard(opts: { seasonId: string; username: string; cardNumber: number; from: Variant; }): Promise<UpgradeResult>

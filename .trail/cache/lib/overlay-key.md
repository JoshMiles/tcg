# lib/overlay-key.ts

- getOverlayKey · function · L13-L19 — async function getOverlayKey(): Promise<string>
- regenerateOverlayKey · function · L22-L26 — async function regenerateOverlayKey(): Promise<string>
- same · function · L28-L31 — function same(a: string, b: string): boolean
- keyMatches · function · L34-L36 — function keyMatches(given: string | null | undefined, key: string): boolean
- isOverlayRequest · function · L39-L47 — async function isOverlayRequest(req: Request): Promise<boolean>
- overlayUrl · function · L50-L53 — function overlayUrl(origin: string, key: string, params: Record<string, string> = {}): string

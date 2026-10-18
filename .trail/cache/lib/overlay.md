# lib/overlay.ts

- OverlayClient · interface · L13-L20 — interface OverlayClient
- OverlayStatus · interface · L22-L29 — interface OverlayStatus
- isValidClientId · function · L33-L35 — function isValidClientId(id: unknown): id is string
- recordHeartbeat · function · L37-L45 — async function recordHeartbeat(c: Omit<OverlayClient, 'at'>): Promise<void>
- getOverlayStatus · function · L47-L71 — async function getOverlayStatus(): Promise<OverlayStatus>
- combine · function · L57-L61 — combine = (pick: (c: OverlayClient) => boolean | null): boolean | null

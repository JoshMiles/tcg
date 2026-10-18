# lib/push-core.ts

- PushKind · type · L8-L8 — type PushKind = (typeof PUSH_KINDS)[number];
- PushDevice · interface · L11-L11 — interface PushDevice
- PushDeviceInfo · interface · L13-L13 — interface PushDeviceInfo
- PushPayload · interface · L15-L15 — interface PushPayload
- validEndpoint · function · L18-L25 — function validEndpoint(v: unknown, dev = process.env.NODE_ENV !== 'production'): v is string
- b64Len · function · L28-L28 — b64Len = (s: string)
- parseSubscription · function · L31-L37 — function parseSubscription(input: unknown): { endpoint: string; keys: { p256dh: string; auth: string } } | null
- deviceLabel · function · L40-L44 — function deviceLabel(ua: string): string
- pushGroup · function · L47-L51 — function pushGroup(kind: string): PushKind
- allowsPush · function · L53-L55 — function allowsPush(pushKinds: readonly string[], kind: string): boolean
- payloadFor · function · L62-L70 — function payloadFor(n: Pick<Notice, 'id' | 'kind' | 'text' | 'tradeId'>): PushPayload

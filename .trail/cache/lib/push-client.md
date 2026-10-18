# lib/push-client.ts

- PushSupport · type · L3-L3 — type PushSupport = 'ok' | 'install-first' | 'unsupported';
- pushSupport · function · L6-L13 — function pushSupport(): PushSupport
- keyBytes · function · L15-L20 — function keyBytes(b64: string): Uint8Array<ArrayBuffer>
- currentSubscription · function · L22-L24 — async function currentSubscription(): Promise<PushSubscription | null>
- enablePush · function · L27-L34 — async function enablePush(publicKey: string): Promise<void>
- disablePush · function · L36-L41 — async function disablePush(): Promise<void>

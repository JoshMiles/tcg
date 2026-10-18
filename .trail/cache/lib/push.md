# lib/push.ts

- key · function · L18-L18 — key = (u: string)
- idOf · function · L19-L19 — idOf = (endpoint: string)
- pushPublicKey · function · L21-L21 — pushPublicKey = ()
- pushConfigured · function · L22-L22 — pushConfigured = ()
- vapid · function · L24-L30 — function vapid()
- readAll · function · L32-L34 — async function readAll(user: string): Promise<Record<string, PushDevice>>
- listDevices · function · L36-L39 — async function listDevices(user: string): Promise<PushDeviceInfo[]>
- SubscribeResult · type · L41-L41 — type SubscribeResult = { ok: true; id: string; devices: PushDeviceInfo[] } | { ok: false; error: string };
- addDevice · function · L44-L57 — async function addDevice(user: string, input: unknown, ua: string): Promise<SubscribeResult>
- removeDevice · function · L60-L64 — async function removeDevice(user: string, ref: { endpoint?: unknown; id?: unknown }): Promise<PushDeviceInfo[]>
- deleteAllDevices · function · L66-L68 — async function deleteAllDevices(user: string): Promise<void>
- PushResult · interface · L70-L70 — interface PushResult
- pushToUser · function · L73-L96 — async function pushToUser(user: string, payload: PushPayload): Promise<PushResult>
- sendTestPush · function · L99-L102 — async function sendTestPush(user: string): Promise<PushResult>
- pushNotice · function · L108-L116 — async function pushNotice(user: string, notice: Notice): Promise<void>
- run · function · L113-L113 — run = async ()

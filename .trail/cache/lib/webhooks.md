# lib/webhooks.ts

- WebhookField · interface · L8-L11 — interface WebhookField
- OutgoingWebhookConfig · interface · L13-L17 — interface OutgoingWebhookConfig
- WebhookSettings · interface · L19-L25 — interface WebhookSettings
- QueuedEvent · interface · L27-L43 — interface QueuedEvent
- getWebhookSettings · function · L47-L60 — async function getWebhookSettings(): Promise<WebhookSettings>
- saveWebhookSettings · function · L62-L64 — async function saveWebhookSettings(settings: WebhookSettings): Promise<void>
- enqueueEvent · function · L68-L71 — async function enqueueEvent(event: QueuedEvent): Promise<void>
- dequeueEvent · function · L73-L75 — async function dequeueEvent(): Promise<QueuedEvent | null>
- interpolate · function · L79-L81 — function interpolate(template: string, vars: Record<string, string>): string
- fireOutgoing · function · L83-L100 — async function fireOutgoing( config: OutgoingWebhookConfig, vars: Record<string, string>, ): Promise<void>
- IncomingWebhook · type · L104-L106 — type IncomingWebhook = | { ok: true; username: string; body: Record<string, unknown> } | { ok: false; response: NextResponse };
- sameSecret · function · L109-L113 — function sameSecret(given: string, expected: string): boolean
- parseIncomingWebhook · function · L116-L127 — async function parseIncomingWebhook(req: Request): Promise<IncomingWebhook>
- queueLength · function · L130-L132 — async function queueLength(): Promise<number>
- clearQueue · function · L135-L139 — async function clearQueue(): Promise<number>

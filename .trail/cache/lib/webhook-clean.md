# lib/webhook-clean.ts

- isPrivateHost · function · L9-L16 — function isPrivateHost(hostname: string): boolean
- checkWebhookUrl · function · L19-L29 — function checkWebhookUrl(raw: string): { ok: true; url: string } | { ok: false; error: string }
- cleanWebhookFields · function · L32-L43 — function cleanWebhookFields(raw: unknown): WebhookField[]

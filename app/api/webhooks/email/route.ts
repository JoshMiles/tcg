import { NextRequest, NextResponse } from 'next/server';
import { handleWebhookEvent, verifyWebhook } from '@/lib/email';

export const dynamic = 'force-dynamic';

// Resend's webhook: a bounce or a spam complaint switches email off for that viewer. Signed by Resend (Svix); with
// RESEND_WEBHOOK_SECRET unset every call is refused. Set the endpoint to <site>/api/webhooks/email for email.bounced and email.complained.
export async function POST(req: NextRequest) {
  const body = await req.text();
  const ok = verifyWebhook(body, { id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') });
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, result: await handleWebhookEvent(JSON.parse(body)) });
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
  }
}

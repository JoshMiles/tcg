import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getWebhookSettings } from '@/lib/webhooks';
import { SITE_URL } from '@/lib/site';
import { presetFile } from '@/lib/mixitup-presets';

// GET /api/admin/mixitup/preset?spec=<the card's PresetSpec>: one Mix It Up command file (ROADMAP 55.5) with the real incoming secret
// and site address filled in. Admin only; the file holds the secret, so it is never cached.
export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const file = presetFile(req.nextUrl.searchParams.get('spec'), SITE_URL, (await getWebhookSettings()).incomingSecret);
  if (!file) return NextResponse.json({ error: 'Unknown command' }, { status: 400 });
  return new NextResponse(file.text, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${file.filename}"`, 'Cache-Control': 'no-store' },
  });
}

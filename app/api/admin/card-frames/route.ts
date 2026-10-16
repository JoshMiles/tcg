import { NextRequest, NextResponse } from 'next/server';
import { hasStaffCapability } from '@/lib/staff-guard';
import { isFrameSourceUrl } from '@/lib/card-art';
import { loadFrameSource } from '@/lib/card-frames';
import { frameInfo, renderFrame } from '@/lib/card-image';

export const dynamic = 'force-dynamic';

// The still-frame picker's data. GET /api/admin/card-frames?url=<card art>
//   without n: { frames, delayMs }
//   with n=<k>: frame k as a small webp (w=<px> sets the width, up to 600).
// Admins only, and only bundled card art or card files in this project's Blob store (the server fetches the URL).
export async function GET(req: NextRequest) {
  if (!(await hasStaffCapability('admin'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = req.nextUrl.searchParams.get('url') ?? '';
  if (!isFrameSourceUrl(url)) return NextResponse.json({ error: 'That is not card art this tool can read.' }, { status: 400 });
  const source = await loadFrameSource(url);
  if (!source) return NextResponse.json({ error: 'Could not read that image.' }, { status: 404 });
  try {
    const n = req.nextUrl.searchParams.get('n');
    const info = await frameInfo(source);
    if (n === null) return NextResponse.json(info, { headers: { 'Cache-Control': 'no-store' } });
    const frame = /^\d{1,4}$/.test(n) ? Number(n) : -1;
    if (frame < 0 || frame >= info.frames) return NextResponse.json({ error: 'No such frame.' }, { status: 400 });
    const w = Math.min(600, Math.max(40, Number(req.nextUrl.searchParams.get('w')) || 260));
    const body = await renderFrame(source, frame, w);
    return new NextResponse(new Uint8Array(body), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=300' } });
  } catch {
    return NextResponse.json({ error: 'Could not read that image.' }, { status: 422 });
  }
}

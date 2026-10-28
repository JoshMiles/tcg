import { NextRequest, NextResponse } from 'next/server';
import { hasStaffCapability } from '@/lib/staff-guard';

// Moved to /admin/stream/twitch (ROADMAP 63.2). A temporary redirect, so Connect still starts from an old bookmark.
export async function GET(req: NextRequest) {
  if (!(await hasStaffCapability('admin'))) return NextResponse.redirect(new URL('/admin', req.url));
  return NextResponse.redirect(new URL('/admin/stream/twitch', req.url), 307);
}

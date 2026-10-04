import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { seedSeason1 } from '@/lib/kv';

export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await seedSeason1();
  return NextResponse.json({ ok: true, message: 'Season 1 seeded' });
}

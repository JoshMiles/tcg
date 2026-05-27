import { NextResponse } from 'next/server';
import { getActiveSeasonWithPacks } from '@/lib/kv';

export async function GET() {
  const result = await getActiveSeasonWithPacks();
  if (!result) return NextResponse.json({ error: 'No active season' }, { status: 404 });
  return NextResponse.json(result);
}

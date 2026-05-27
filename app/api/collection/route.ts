import { NextRequest, NextResponse } from 'next/server';
import { getCollection, saveCollection, deleteCollection } from '@/lib/kv';

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });
  return NextResponse.json(await getCollection(name));
}

export async function POST(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });
  const { data } = await req.json();
  await saveCollection(name, data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const name = searchParams.get('name');
  const username = searchParams.get('username');
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });

  if (username) {
    const data = await getCollection(name);
    delete data[username.toLowerCase()];
    await saveCollection(name, data);
  } else {
    await deleteCollection(name);
  }
  return NextResponse.json({ ok: true });
}

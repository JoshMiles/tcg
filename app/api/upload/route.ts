import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { isAuthenticated } from '@/lib/auth';

const ALLOWED = ['image/gif', 'image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'];

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
  }
  const { url } = await put(file.name, file, { access: 'public' });
  return NextResponse.json({ url });
}

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { isAuthenticated } from '@/lib/auth';
import { storeOptimizedCard } from '@/lib/card-upload';

const ALLOWED = ['image/gif', 'image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm'];

// Small files only (Vercel caps request bodies at 4.5MB). Large GIFs use the client-upload
// flow: /api/upload/token → browser → Blob → /api/upload/optimize.
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

  // GIFs always get the same optimization as the large-file flow.
  if (file.type === 'image/gif') {
    try {
      return NextResponse.json(await storeOptimizedCard(Buffer.from(await file.arrayBuffer())));
    } catch {
      return NextResponse.json({ error: 'Could not process image. Is it a valid GIF?' }, { status: 422 });
    }
  }

  const { url } = await put(file.name, file, { access: 'public' });
  return NextResponse.json({ url });
}

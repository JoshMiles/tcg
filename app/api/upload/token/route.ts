import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { isAuthenticated } from '@/lib/auth';

// Issues client-upload tokens so the browser can send large GIFs straight to Blob,
// bypassing the 4.5MB serverless request-body limit. The raw GIF is then processed by
// /api/upload/optimize.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // Only reached for the admin's own request (the Blob service's completion callback skips this).
        if (!(await isAuthenticated())) throw new Error('Unauthorized');
        return { allowedContentTypes: ['image/gif'], maximumSizeInBytes: 100 * 1024 * 1024 };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 400 });
  }
}

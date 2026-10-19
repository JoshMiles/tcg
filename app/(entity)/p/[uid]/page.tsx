import type { Metadata } from 'next';

// A print's short address, "p for edition": /p/1023381 does the same as /c/1023381 (which keeps working for old links).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Card edition', robots: { index: false, follow: true } };
export { default } from '../../c/[uid]/page';

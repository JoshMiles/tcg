import type { Metadata } from 'next';

// The admin sign-in page: kept out of search results.
export const metadata: Metadata = { title: 'Admin login', robots: { index: false, follow: false } };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from 'next';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = { title: 'Offline', robots: { index: false } };

// Cached by the service worker (public/sw.js) and shown when a page can't be reached. Inline styles only: this page has to look
// right without the site's CSS, which isn't cached.
export default function OfflinePage() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: '#0a0f1e', color: '#fff', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 380 }}>
        <img src="/icons/icon-192.png" alt="" width={96} height={96} style={{ borderRadius: 20 }} />
        <h1 style={{ fontSize: 28, margin: '20px 0 8px' }}>You&rsquo;re offline</h1>
        <p style={{ color: '#9ca3af', lineHeight: 1.6, margin: 0 }}>
          The Cheesy TCG needs a connection to show your cards and the leaderboard. Check your signal and try again.
        </p>
        <a href="/" style={{ display: 'inline-block', marginTop: 24, padding: '10px 22px', borderRadius: 12, background: '#facc15', color: '#0a0f1e', fontWeight: 700, textDecoration: 'none' }}>Try again</a>
      </div>
    </main>
  );
}

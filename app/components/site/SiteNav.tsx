'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/app/components/Avatar';
import { LiveBadge } from './Live';

const LINKS = [
  { href: '/', label: 'Home', exact: true },
  { href: '/collection', label: 'Collections' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/trade', label: 'Trade' },
  { href: '/stats', label: 'Season Stats' },
  { href: '/cards', label: 'Card Dex' },
  { href: '/faq', label: 'FAQ' },
];

export interface NavUser { username: string; displayName: string; avatarUrl?: string }

const TwitchGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4.3 3 3 6.3v13.4h4.6V22h2.6l2.3-2.3h3.7L21 14.6V3H4.3Zm14.9 10.6-2.9 2.9h-4.6l-2.3 2.3v-2.3H6.7V4.7h12.5v8.9ZM16.4 7.9v4.6h-1.7V7.9h1.7Zm-4.6 0v4.6h-1.7V7.9h1.7Z" />
  </svg>
);

/** Top bar for the public site. Collapses to a menu button on small screens. */
export function SiteNav({ user, loginEnabled }: { user: NavUser | null; loginEnabled: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // account dropdown
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the account dropdown on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const loginHref = `/auth/twitch?returnTo=${encodeURIComponent(pathname === '/' ? '/account' : pathname)}`;

  // Close the mobile menu when navigating.
  useEffect(() => { setOpen(false); setMenuOpen(false); }, [pathname]);

  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(href + '/'));

  return (
    <header className="sticky top-0 z-40 border-b border-yellow-500/20 bg-gray-950/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="The Cheesy TCG — home">
          <img src="/brand/icon.png" alt="" width={34} height={34} className="rounded-lg ring-1 ring-yellow-500/50" />
          <span className="font-display text-lg font-bold leading-none text-yellow-300">
            <span className="text-[11px] font-semibold text-yellow-500/80 block tracking-wider uppercase">The</span>
            Cheesy TCG
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 ml-4" aria-label="Main">
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href, l.exact) ? 'page' : undefined}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                isActive(l.href, l.exact) ? 'bg-yellow-500/15 text-yellow-300' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LiveBadge />
          {user ? (
            <div className="relative hidden sm:block" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(o => !o)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors"
              >
                <Avatar src={user.avatarUrl} name={user.displayName} className="w-7 h-7 text-xs" />
                <span className="text-sm font-semibold text-yellow-100 max-w-[9rem] truncate">{user.displayName}</span>
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-52 rounded-xl border border-gray-700 bg-gray-900 shadow-card p-1.5 grid gap-0.5">
                  <Link role="menuitem" href="/account" className="px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/5">📈 My stats</Link>
                  <Link role="menuitem" href={`/collection/${user.username}`} className="px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/5">🃏 My collection</Link>
                  <form action="/auth/logout" method="post" className="contents">
                    <button role="menuitem" type="submit" className="text-left px-3 py-2 rounded-lg text-sm text-red-300 hover:bg-red-950/40">Log out</button>
                  </form>
                </div>
              )}
            </div>
          ) : loginEnabled ? (
            <a
              href={loginHref}
              className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-bold text-white bg-[#9146ff] hover:bg-[#a36bff] transition-colors"
            >
              <TwitchGlyph /> Log in with Twitch
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label="Menu"
            className="md:hidden w-9 h-9 rounded-lg border border-gray-700 text-gray-300 hover:text-white flex items-center justify-center text-lg"
          >
            {open ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {open && (
        <nav id="site-menu" className="md:hidden border-t border-gray-800 px-4 py-3 grid gap-1" aria-label="Main">
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-2.5 rounded-lg text-sm font-semibold ${isActive(l.href, l.exact) ? 'bg-yellow-500/15 text-yellow-300' : 'text-gray-300 hover:bg-white/5'}`}
            >
              {l.label}
            </Link>
          ))}
          {user ? (
            <>
              <Link href="/account" className="px-3 py-2.5 rounded-lg text-sm font-semibold text-yellow-200 hover:bg-white/5">📈 My stats ({user.displayName})</Link>
              <Link href={`/collection/${user.username}`} className="px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-300 hover:bg-white/5">🃏 My collection</Link>
              <form action="/auth/logout" method="post">
                <button type="submit" className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-red-300 hover:bg-red-950/40">Log out</button>
              </form>
            </>
          ) : loginEnabled ? (
            <a href={loginHref} className="mt-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold text-white bg-[#9146ff]">
              <TwitchGlyph /> Log in with Twitch
            </a>
          ) : null}
        </nav>
      )}
    </header>
  );
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const LINKS = [
  { href: '/', label: 'Home', exact: true },
  { href: '/collection', label: 'Collections' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/stats', label: 'Season Stats' },
  { href: '/cards', label: 'Card Dex' },
];

/** Top bar for the public site. Collapses to a menu button on small screens. */
export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile menu when navigating.
  useEffect(() => { setOpen(false); }, [pathname]);

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
          {/* Twitch login arrives in the next update; the slot is here so the layout is final. */}
          <span
            title="Logging in with Twitch is coming soon"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-purple-200/60 bg-purple-500/10 border border-purple-400/20 cursor-default select-none"
          >
            Log in with Twitch · soon
          </span>
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
          <span className="px-3 py-2 text-xs text-purple-200/60">Twitch login coming soon</span>
        </nav>
      )}
    </header>
  );
}

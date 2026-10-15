'use client';
import { Icon } from '@/app/components/Icon';
import { PendingButton } from '../../admin/components/PendingButton';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/app/components/Avatar';
import { LiveBadge } from './Live';
import { InstallButton } from './InstallButton';
import { NotificationBell } from './NotificationBell';
import { OPEN_SEARCH_EVENT, SearchButton } from './SiteSearch';
import { nextMenuIndex } from '@/lib/menu-nav';

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
/** The signed-in viewer's place in the active season (null when unranked or there is no season). */
export interface NavRank { rank: number; score: number; total: number; season: string }

const SEEN_KEY = 'tcg_rank_seen';
/** What changed since the viewer last opened the account menu: positive = climbed. */
function readSeen(username: string): { rank: number; score: number } | null {
  try { const v = JSON.parse(localStorage.getItem(`${SEEN_KEY}:${username}`) || 'null'); return v && typeof v.rank === 'number' ? v : null; } catch { return null; }
}

const TwitchGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4.3 3 3 6.3v13.4h4.6V22h2.6l2.3-2.3h3.7L21 14.6V3H4.3Zm14.9 10.6-2.9 2.9h-4.6l-2.3 2.3v-2.3H6.7V4.7h12.5v8.9ZM16.4 7.9v4.6h-1.7V7.9h1.7Zm-4.6 0v4.6h-1.7V7.9h1.7Z" />
  </svg>
);

/** Top bar for the public site. Collapses to a menu button on small screens. */
/** Where the signed-in staff member's panel is (admins and the super admin: the admin panel; mods: the mod panel). */
export interface NavStaff { href: string; label: string }

export function SiteNav({ user, loginEnabled, rank, staff }: { user: NavUser | null; loginEnabled: boolean; rank?: NavRank | null; staff?: NavStaff | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // account dropdown
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const [delta, setDelta] = useState(0); // places climbed (+) or lost (-) since the viewer last looked

  // The account menu behaves like a real menu: focus moves into it, arrows / Home / End move, Esc and Tab close it.
  useEffect(() => {
    if (!menuOpen) return;
    const items = () => [...(menuRef.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
    items()[0]?.focus();
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setMenuOpen(false); triggerRef.current?.focus(); return; }
      if (e.key === 'Tab') { setMenuOpen(false); return; }
      const list = items();
      const next = nextMenuIndex(list.indexOf(document.activeElement as HTMLElement), e.key, list.length);
      if (next !== null) { e.preventDefault(); list[next]?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  // The phone menu closes on Escape too (and gives focus back to its button).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); burgerRef.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Rank movement since the last time they opened the menu (kept in this browser only).
  useEffect(() => {
    if (!user || !rank) { setDelta(0); return; }
    const seen = readSeen(user.username);
    setDelta(seen ? seen.rank - rank.rank : 0);
  }, [user, rank]);
  const markSeen = () => {
    if (!user || !rank) return;
    try { localStorage.setItem(`${SEEN_KEY}:${user.username}`, JSON.stringify({ rank: rank.rank, score: rank.score })); } catch { /* optional */ }
    setDelta(0);
  };

  const loginHref = `/auth/twitch?returnTo=${encodeURIComponent(pathname === '/' ? '/account' : pathname)}`;

  // Close the mobile menu when navigating.
  useEffect(() => { setOpen(false); setMenuOpen(false); }, [pathname]);

  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(href + '/'));

  return (
    <header className="sticky top-0 z-40 border-b border-yellow-500/20 bg-gray-950/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="The Cheesy TCG, home">
          <img src="/brand/icon.png" alt="" width={34} height={34} className="rounded-lg ring-1 ring-yellow-500/50" />
          <span className="font-display text-lg font-bold leading-none text-yellow-300">
            <span className="text-[11px] font-semibold text-yellow-500/80 block tracking-wider uppercase">The</span>
            Cheesy TCG
          </span>
        </Link>

        <nav className="hidden xl:flex items-center gap-1 ml-4" aria-label="Main">
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href, l.exact) ? 'page' : undefined}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                isActive(l.href, l.exact) ? 'bg-yellow-500/15 text-yellow-300' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <SearchButton className="h-9 px-2.5" />
          <LiveBadge />
          <InstallButton />
          {staff && (
            <Link href={staff.href} prefetch={false} className="hidden 2xl:inline-flex items-center gap-1.5 h-9 px-3 whitespace-nowrap shrink-0 rounded-lg border border-purple-400/40 bg-purple-500/10 text-xs font-bold text-purple-200 hover:bg-purple-500/20 transition-colors">
              <Icon name="shield" />{staff.label}
            </Link>
          )}
          {user && <NotificationBell />}
          {user ? (
            <div className="relative hidden sm:block" ref={menuRef}>
              <button
                ref={triggerRef}
                type="button"
                onClick={() => { setMenuOpen(o => !o); markSeen(); }}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label={`Account menu, ${user.displayName}`}
                className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors"
              >
                <Avatar src={user.avatarUrl} name={user.displayName} className="w-7 h-7 text-xs" />
                <span className="hidden 2xl:inline text-sm font-semibold text-yellow-100 max-w-[9rem] truncate">{user.displayName}</span>
                {rank && <RankChip rank={rank} delta={delta} />}
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-700 bg-gray-900 shadow-card p-1.5 grid gap-0.5">
                  {rank && (
                    <div className="px-3 py-2 mb-0.5 border-b border-gray-800 text-xs text-gray-400">
                      <span className="block text-gray-500">{rank.season}</span>
                      <span className="text-sm font-semibold text-gray-100">#{rank.rank} of {rank.total}</span> · <span className="text-yellow-300 font-semibold tabular-nums">{rank.score.toLocaleString()} pts</span>
                    </div>
                  )}
                  <Link role="menuitem" href="/account" className="px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/5"><Icon name="trend" className="mr-1.5" />My stats</Link>
                  <Link role="menuitem" href={`/u/${user.username}`} className="px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/5"><Icon name="user" className="mr-1.5" />My profile</Link>
                  <Link role="menuitem" href="/settings" className="px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/5"><Icon name="settings" className="mr-1.5" />Settings</Link>
                  {staff && <Link role="menuitem" href={staff.href} prefetch={false} className="px-3 py-2 rounded-lg text-sm text-purple-200 hover:bg-purple-500/10"><Icon name="shield" className="mr-1.5" />{staff.label}</Link>}
                  <form action="/auth/logout" method="post" className="contents">
                    <PendingButton role="menuitem" type="submit" className="text-left px-3 py-2 rounded-lg text-sm text-red-300 hover:bg-red-950/40">Log out</PendingButton>
                  </form>
                </div>
              )}
            </div>
          ) : loginEnabled ? (
            <a
              href={loginHref}
              className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap shrink-0 text-white bg-[#9146ff] hover:bg-[#a36bff] transition-colors"
            >
              <TwitchGlyph /> Log in with Twitch
            </a>
          ) : null}
          <button
            ref={burgerRef}
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label="Menu"
            className="xl:hidden w-9 h-9 rounded-lg border border-gray-700 text-gray-300 hover:text-white flex items-center justify-center text-lg"
          >
            {open ? <Icon name="x" className="w-5 h-5" /> : <Icon name="menu" className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {open && <div className="xl:hidden fixed inset-0 top-14 z-[-1] bg-gray-950/60" onClick={() => setOpen(false)} aria-hidden />}
      {open && (
        <nav id="site-menu" className="xl:hidden border-t border-gray-800 bg-gray-950 px-4 py-3 grid gap-1" aria-label="Main">
          <button type="button" onClick={() => { setOpen(false); window.dispatchEvent(new Event(OPEN_SEARCH_EVENT)); }} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-700 text-sm text-gray-400 text-left">
            <Icon name="search" /> Search collectors, cards and pages…
          </button>
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-2.5 rounded-lg text-sm font-semibold ${isActive(l.href, l.exact) ? 'bg-yellow-500/15 text-yellow-300' : 'text-gray-300 hover:bg-white/5'}`}
            >
              {l.label}
            </Link>
          ))}
          {staff && <Link href={staff.href} prefetch={false} className="px-3 py-2.5 rounded-lg text-sm font-semibold text-purple-200 hover:bg-purple-500/10"><Icon name="shield" className="mr-1.5" />{staff.label}</Link>}
          {user ? (
            <>
              <Link href="/account" className="px-3 py-2.5 rounded-lg text-sm font-semibold text-yellow-200 hover:bg-white/5"><Icon name="trend" className="mr-1.5" />My stats ({user.displayName}){rank && <span className="ml-2 text-xs text-gray-400">#{rank.rank} · {rank.score.toLocaleString()} pts</span>}</Link>
              <Link href={`/u/${user.username}`} className="px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-300 hover:bg-white/5"><Icon name="user" className="mr-1.5" />My profile</Link>
              <Link href="/settings" className="px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-300 hover:bg-white/5"><Icon name="settings" className="mr-1.5" />Settings</Link>
              <form action="/auth/logout" method="post">
                <PendingButton type="submit" className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-red-300 hover:bg-red-950/40">Log out</PendingButton>
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

/** "#2" beside the name, with a small green / red arrow when the viewer has moved since they last opened the menu. */
function RankChip({ rank, delta }: { rank: NavRank; delta: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-extrabold text-yellow-300 bg-yellow-500/10 border border-yellow-400/25 rounded-full px-1.5 py-px tabular-nums"
      title={`#${rank.rank} of ${rank.total} in ${rank.season} · ${rank.score.toLocaleString()} points${delta ? (delta > 0 ? ` · up ${delta} since you last looked` : ` · down ${-delta} since you last looked`) : ''}`}
    >
      #{rank.rank}
      {delta !== 0 && <span className={delta > 0 ? 'text-green-400' : 'text-red-400'}>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}</span>}
    </span>
  );
}

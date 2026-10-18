'use client';
import { Icon } from '@/app/components/Icon';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'tcg_admin_sidebar';

/**
 * The admin frame. Server-rendered pieces (brand, nav, footer) are passed in as slots; this owns only the layout state:
 *  - phones/tablets (< lg): the sidebar is an off-canvas drawer opened from a top bar, closed by the backdrop, Esc or
 *    choosing a page;
 *  - desktop (lg+): the sidebar can be collapsed to an icon rail (remembered in localStorage).
 * Anything that should disappear when collapsed carries the `aside-label` class (see globals.css).
 */
export function AdminShell({
  brand, nav, status, footer, children,
}: {
  brand: React.ReactNode;
  nav: React.ReactNode;
  status: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  // A page (the Overlay Editor) can ask for the sidebar to collapse while it is open, without touching the saved
  // choice: it sets window.__tcgSidebarForce and fires a 'tcg:sidebar' event (the flag covers a child that mounts first).
  const [forced, setForced] = useState(false);
  const pathname = usePathname();
  // Below lg the sidebar is an off-canvas drawer. While it is closed it must not be reachable (Tab would walk through invisible links and a
  // screen reader would read them), so it is `inert` until it is opened. On a wide screen it is always on show.
  const [wide, setWide] = useState(true);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(STORAGE_KEY) === 'collapsed'); } catch { /* private mode */ }
    setForced(!!(window as Window & { __tcgSidebarForce?: boolean }).__tcgSidebarForce);
    const onForce = (e: Event) => setForced(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener('tcg:sidebar', onForce);
    return () => window.removeEventListener('tcg:sidebar', onForce);
  }, []);
  const shownCollapsed = collapsed || forced;
  // A collapsed sidebar opens over the page while hovered or focused (the page itself doesn't move).
  const [peek, setPeek] = useState(false);
  const expandedLook = !shownCollapsed || peek;
  const toggle = () => {
    // The button keeps focus after a click, which would hold the hover-expanded look open; let go of it.
    (document.activeElement as HTMLElement | null)?.blur();
    setPeek(false);
    // Expanding while a page forced it collapsed just overrides that (not saved).
    if (forced && !collapsed) { setForced(false); return; }
    setCollapsed(c => {
      try { localStorage.setItem(STORAGE_KEY, c ? 'expanded' : 'collapsed'); } catch { /* ignore */ }
      return !c;
    });
    setForced(false);
  };

  // Choosing a page closes the drawer.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus(); // keyboard users land in the drawer, and go back to the menu button when it closes
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); menuButton.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen text-gray-100">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-60 focus:rounded-lg focus:bg-yellow-500 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-gray-950">Skip to content</a>
      {/* Mobile top bar */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-30 h-14 flex items-center gap-3 px-3 bg-gray-950/95 backdrop-blur-sm border-b border-poke-blue-light/15">
        <button
          ref={menuButton}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="w-10 h-10 rounded-lg text-gray-300 hover:bg-white/10 flex items-center justify-center text-xl"
        >
          <Icon name="menu" className="w-5 h-5" />
        </button>
        <span className="font-display text-yellow-400 font-bold tracking-tight">The Cheesy TCG</span>
      </header>

      {/* Backdrop for the drawer */}
      {open && <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        inert={!wide && !open}
        data-collapsed={!expandedLook}
        onMouseEnter={() => setPeek(true)}
        onMouseLeave={() => setPeek(false)}
        onFocusCapture={() => setPeek(true)}
        onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPeek(false); }}
        className={`admin-aside bg-gray-950/95 lg:bg-gray-950/80 backdrop-blur-sm border-r border-poke-blue-light/15 flex flex-col shrink-0
          fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:z-40 lg:translate-x-0 lg:transition-[width] ${expandedLook ? 'lg:w-60' : 'lg:w-18'} ${shownCollapsed && peek ? 'lg:shadow-2xl' : ''}`}
      >
        <div className="px-4 pt-5 pb-4 flex items-center gap-2">
          <div className="flex-1 min-w-0">{brand}</div>
          <button
            ref={closeButton}
            type="button"
            onClick={() => { setOpen(false); menuButton.current?.focus(); }}
            aria-label="Close menu"
            className="lg:hidden w-9 h-9 rounded-lg text-gray-400 hover:bg-white/10 text-lg"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>
        
        {nav}
        <div className="p-3 pt-2.5 border-t border-white/6 space-y-2.5">
          {status}
          {footer}
        </div>

        {/* Collapse handle on the sidebar's edge (desktop) */}
        <button
          type="button"
          onClick={toggle}
          aria-label={shownCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={shownCollapsed ? 'Keep sidebar open' : 'Collapse sidebar'}
          className="hidden lg:flex absolute -right-3 top-[4.6rem] z-10 w-6 h-6 items-center justify-center rounded-full bg-gray-900 border border-gray-700 text-gray-400 hover:text-yellow-300 hover:border-yellow-500/50 shadow-sm transition-colors"
        >
          <Icon name={shownCollapsed ? 'chevronRight' : 'chevronLeft'} className="w-3.5 h-3.5" />
        </button>
      </aside>

      <main id="admin-main" tabIndex={-1} className={`flex-1 min-w-0 overflow-auto focus:outline-hidden px-4 pb-6 pt-20 sm:px-6 lg:p-8 lg:transition-[margin] ${shownCollapsed ? 'lg:ml-18' : 'lg:ml-60'}`}>
        {children}
      </main>
    </div>
  );
}

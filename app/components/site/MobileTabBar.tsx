'use client';
import { Icon, type IconName } from '@/app/components/Icon';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type RefObject } from 'react';
import { LINKS, isActive } from './links';

/** Event the bell fires whenever its unread counts change, so the bar can badge without fetching anything itself. */
export const NOTICE_COUNTS_EVENT = 'tcg:notice-counts';
export interface NoticeCounts { unread: number; offers: number }

/** Order, icons and links of the tabs; labels and active rule come from the shared LINKS. A signed-in viewer's second tab is their own collection (Card Dex then lives in the More sheet). */
export function tabsFor(username?: string): { href: string; icon: IconName; label?: string }[] {
  return [
    { href: '/', icon: 'home' },
    username ? { href: `/u/${username}`, icon: 'book', label: 'Collection' } : { href: '/cards', icon: 'cards' },
    { href: '/trade', icon: 'trade' },
    { href: '/leaderboard', icon: 'trophy' },
  ];
}
const TEXT_FIELD = 'textarea, select, [contenteditable=""], [contenteditable="true"], input:not([type=checkbox],[type=radio],[type=button],[type=submit],[type=reset],[type=range],[type=file],[type=color],[type=image])';

/** The phone tab bar (below xl): Home, Card Dex (Collection when signed in), Trade, Leaderboard and More, which opens the More sheet. Hidden while a text field has focus. */
export function MobileTabBar({ username, menuOpen, onMore, moreRef }: { username?: string; menuOpen: boolean; onMore: () => void; moreRef: RefObject<HTMLButtonElement | null> }) {
  const pathname = usePathname();
  const [typing, setTyping] = useState(false);
  const [counts, setCounts] = useState<NoticeCounts>({ unread: 0, offers: 0 });

  useEffect(() => {
    const onFocus = (e: FocusEvent) => setTyping(e.target instanceof Element && e.target.matches(TEXT_FIELD));
    const onCounts = (e: Event) => setCounts((e as CustomEvent<NoticeCounts>).detail);
    document.addEventListener('focusin', onFocus);
    const onBlur = () => setTyping(false);
    document.addEventListener('focusout', onBlur);
    window.addEventListener(NOTICE_COUNTS_EVENT, onCounts);
    return () => { document.removeEventListener('focusin', onFocus); document.removeEventListener('focusout', onBlur); window.removeEventListener(NOTICE_COUNTS_EVENT, onCounts); };
  }, []);

  const item = 'relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors';
  const badge = (n: number) => n > 0 && (
    <span className="absolute top-1.5 left-1/2 ml-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-gray-950" aria-label={`${n} new`}>{n > 9 ? '9+' : n}</span>
  );

  return (
    <nav aria-label="Main" className={`${typing ? 'hidden ' : 'flex '}xl:hidden fixed bottom-0 inset-x-0 z-40 h-[calc(3.5rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] border-t border-yellow-500/20 bg-gray-950/90 backdrop-blur-sm`}>
      {tabsFor(username).map(t => {
        const l = LINKS.find(x => x.href === t.href);
        const active = isActive(pathname, t.href, l?.exact);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined} className={`${item} ${active ? 'text-yellow-300' : 'text-gray-400 hover:text-white'}`}>
            <Icon name={t.icon} className="w-5 h-5" />{t.label ?? l?.label}
            {t.href === '/trade' && badge(counts.offers)}
          </Link>
        );
      })}
      <button ref={moreRef} type="button" onClick={onMore} aria-expanded={menuOpen} aria-haspopup="dialog" className={`${item} ${menuOpen ? 'text-yellow-300' : 'text-gray-400 hover:text-white'}`}>
        <Icon name={menuOpen ? 'x' : 'menu'} className="w-5 h-5" />More
        {badge(counts.unread)}
      </button>
    </nav>
  );
}

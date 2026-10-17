'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/app/components/Icon';

const ITEMS: { href: string; label: string; icon: IconName; exact?: boolean }[] = [
  { href: '/mod', label: 'Overview', icon: 'chart', exact: true },
  { href: '/mod/activity', label: 'Activity', icon: 'radio' },
  { href: '/mod/users', label: 'Viewers', icon: 'users' },
  { href: '/mod/trades', label: 'Trades', icon: 'trade' },
  { href: '/mod/feedback', label: 'Feedback', icon: 'chat' },
  { href: '/mod/testers', label: 'Testers', icon: 'flask' },
  { href: '/mod/changelog', label: "What's new", icon: 'sparkles' },
];

export function ModNav({ newFeedback = 0 }: { newFeedback?: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Mod panel" className="no-scrollbar flex items-center gap-1 overflow-x-auto">
      {ITEMS.map(i => {
        const on = i.exact ? path === i.href : path.startsWith(i.href);
        return (
          <Link
            key={i.href} href={i.href} aria-current={on ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${on ? 'bg-yellow-400/15 text-yellow-300' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            <Icon name={i.icon} />{i.label}{i.href === '/mod/feedback' && newFeedback > 0 && <span className="rounded-full bg-amber-400/20 px-1.5 text-[10px] font-extrabold text-amber-300" aria-label={`${newFeedback} new`}>{newFeedback}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

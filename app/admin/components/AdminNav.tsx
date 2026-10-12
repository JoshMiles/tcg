'use client';
import { Icon, type IconName } from '@/app/components/Icon';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Item = { href: string; label: string; icon: IconName; exact?: boolean };

// Grouped so the sidebar reads as a few clear areas instead of one long list.
const GROUPS: { title: string; items: Item[] }[] = [
  { title: 'Overview', items: [
    { href: '/admin', label: 'Dashboard', icon: 'chart', exact: true },
    { href: '/admin/activity', label: 'Live Activity', icon: 'radio' },
  ] },
  { title: 'Game', items: [
    { href: '/admin/seasons', label: 'Seasons', icon: 'trophy' },
    { href: '/admin/packs', label: 'Packs', icon: 'cards' },
    { href: '/admin/assets', label: 'Assets', icon: 'image' },
    { href: '/admin/overlay', label: 'Overlay Editor', icon: 'palette' },
  ] },
  { title: 'Community', items: [
    { href: '/admin/users', label: 'Users', icon: 'users' },
    { href: '/admin/trades', label: 'Trades', icon: 'trade' },
  ] },
  { title: 'System', items: [
    { href: '/admin/sandbox', label: 'Sandbox', icon: 'flask' },
    { href: '/admin/settings', label: 'Settings', icon: 'settings' },
  ] },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="flex-1 min-h-0 px-3 pt-3 pb-2 overflow-y-auto">
      {GROUPS.map((g, gi) => (
        <div key={g.title} className={gi > 0 ? 'mt-4' : ''}>
          <p className="aside-label px-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-600">{g.title}</p>
          {gi > 0 && <div className="aside-rule" aria-hidden />}
          <ul className="space-y-0.5">
            {g.items.map(({ href, label, icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    title={label}
                    aria-current={active ? 'page' : undefined}
                    className={`aside-item group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                      active ? 'bg-yellow-500/10 text-yellow-200' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {active && <span aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.6)]" />}
                    <Icon name={icon} className={`w-[1.15rem] h-[1.15rem] shrink-0 transition-colors ${active ? 'text-yellow-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
                    <span className="aside-label truncate">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

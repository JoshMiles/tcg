'use client';
import { Icon, type IconName } from '@/app/components/Icon';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav: { href: string; label: string; icon: IconName; exact?: boolean }[] = [
  { href: '/admin', label: 'Dashboard', icon: 'chart', exact: true },
  { href: '/admin/activity', label: 'Live Activity', icon: 'radio' },
  { href: '/admin/seasons', label: 'Seasons', icon: 'trophy' },
  { href: '/admin/packs', label: 'Packs', icon: 'cards' },
  { href: '/admin/users', label: 'Users', icon: 'users' },
  { href: '/admin/trades', label: 'Trades', icon: 'trade' },
  { href: '/admin/assets', label: 'Assets', icon: 'image' },
  { href: '/admin/overlay', label: 'Overlay Editor', icon: 'palette' },
  { href: '/admin/sandbox', label: 'Sandbox', icon: 'flask' },
  { href: '/admin/settings', label: 'Settings', icon: 'settings' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="flex-1 p-3 pt-4 space-y-1 overflow-y-auto">
      {nav.map(({ href, label, icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={`aside-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
              active
                ? 'bg-gradient-to-r from-yellow-500/20 to-yellow-500/5 text-yellow-300 shadow-glow'
                : 'text-gray-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon name={icon} className={`w-[1.15rem] h-[1.15rem] ${active ? 'text-yellow-400' : 'text-gray-500'}`} />
            <span className="aside-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

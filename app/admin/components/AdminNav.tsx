'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/admin', label: 'Dashboard', icon: '📊', exact: true },
  { href: '/admin/activity', label: 'Live Activity', icon: '📡' },
  { href: '/admin/seasons', label: 'Seasons', icon: '🏆' },
  { href: '/admin/packs', label: 'Packs', icon: '🎴' },
  { href: '/admin/users', label: 'Users', icon: '👥' },
  { href: '/admin/assets', label: 'Assets', icon: '🖼️' },
  { href: '/admin/webhooks', label: 'Webhooks', icon: '🔗' },
  { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
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
            <span className={`text-base leading-none ${active ? '' : 'grayscale opacity-70'}`}>{icon}</span>
            <span className="aside-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

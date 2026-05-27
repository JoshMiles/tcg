import Link from 'next/link';
import { CopyUrlButton } from './components/copy-url-button';

const nav = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/seasons', label: 'Seasons' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/settings', label: 'Settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-800">
          <span className="text-yellow-400 font-bold text-lg">🃏 TCG Admin</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="block px-3 py-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white text-sm transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-800 space-y-1">
          <CopyUrlButton />
          <a
            href="/overlay.html"
            target="_blank"
            className="block px-3 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors"
          >
            Preview Overlay ↗
          </a>
          <form action="/api/auth/logout" method="POST">
            <button className="w-full text-left px-3 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors">
              Log out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}

import { AdminNav } from './components/AdminNav';
import { CopyUrlButton } from './components/copy-url-button';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        {/* Brand */}
        <div className="px-4 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">🃏</span>
            <div>
              <p className="text-yellow-400 font-bold text-sm leading-none tracking-tight">TCG Admin</p>
              <p className="text-gray-600 text-xs mt-0.5">Card Manager</p>
            </div>
          </div>
        </div>

        <AdminNav />

        {/* Bottom actions */}
        <div className="p-3 border-t border-gray-800 space-y-0.5">
          <CopyUrlButton />
          <a
            href="/overlay.html"
            target="_blank"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-600 hover:text-gray-300 text-xs transition-colors"
          >
            <span>↗</span> Preview Overlay
          </a>
          <form action="/api/auth/logout" method="POST">
            <button className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-gray-600 hover:text-gray-300 text-xs transition-colors">
              <span>→</span> Log out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-auto min-w-0">
        {children}
      </main>
    </div>
  );
}

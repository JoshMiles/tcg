import { AdminNav } from './components/AdminNav';
import { BrandMark } from './components/BrandMark';
import { BuildBadge } from './components/BuildBadge';
import { OverlayStatus } from './components/OverlayStatus';
import { OverlayStatusProvider } from './components/OverlayStatusContext';
import { CopyUrlButton } from './components/copy-url-button';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <OverlayStatusProvider>
    <div className="flex min-h-screen text-gray-100">
      <aside className="w-60 bg-gray-950/80 backdrop-blur border-r border-poke-blue-light/15 flex flex-col shrink-0 sticky top-0 h-screen">
        {/* Brand */}
        <div className="px-4 py-5">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <p className="font-display text-yellow-400 font-bold text-lg leading-none tracking-tight">The Cheesy TCG</p>
              <p className="text-gray-500 text-xs mt-1 font-semibold uppercase tracking-widest">Card Manager</p>
            </div>
          </div>
        </div>
        <div className="holo-strip mx-4 rounded-full opacity-80" />

        <AdminNav />

        <OverlayStatus variant="compact" />

        {/* Bottom actions */}
        <div className="p-3 border-t border-poke-blue-light/10 space-y-0.5">
          <CopyUrlButton />
          <a
            href="/overlay.html"
            target="_blank"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-yellow-300 hover:bg-white/5 text-xs font-semibold transition-colors"
          >
            <span>↗</span> Preview Overlay
          </a>
          <form action="/api/auth/logout" method="POST">
            <button className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-poke-red hover:bg-white/5 text-xs font-semibold transition-colors">
              <span>→</span> Log out
            </button>
          </form>
          <BuildBadge />
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-auto min-w-0">
        {children}
      </main>
    </div>
    </OverlayStatusProvider>
  );
}

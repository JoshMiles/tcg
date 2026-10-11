import { AdminNav } from './components/AdminNav';
import { AdminShell } from './components/AdminShell';
import { BrandMark } from './components/BrandMark';
import { BuildBadge } from './components/BuildBadge';
import { OverlayStatus } from './components/OverlayStatus';
import { OverlayStatusProvider } from './components/OverlayStatusContext';
import { CopyUrlButton } from './components/copy-url-button';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <OverlayStatusProvider>
      <AdminShell
        brand={
          <div className="flex items-center gap-3">
            <BrandMark />
            <div className="aside-label min-w-0">
              <p className="font-display text-yellow-400 font-bold text-lg leading-none tracking-tight">The Cheesy TCG</p>
              <p className="text-gray-500 text-xs mt-1 font-semibold uppercase tracking-widest">Card Manager</p>
            </div>
          </div>
        }
        nav={<AdminNav />}
        status={<OverlayStatus variant="compact" />}
        footer={
          <>
            <CopyUrlButton />
            <a
              href="/overlay.html"
              target="_blank"
              title="Preview Overlay"
              className="aside-item flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-yellow-300 hover:bg-white/5 text-xs font-semibold transition-colors"
            >
              <span aria-hidden>↗</span> <span className="aside-label">Preview Overlay</span>
            </a>
            <form action="/api/auth/logout" method="POST">
              <button
                title="Log out"
                className="aside-item w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-poke-red hover:bg-white/5 text-xs font-semibold transition-colors"
              >
                <span aria-hidden>→</span> <span className="aside-label">Log out</span>
              </button>
            </form>
            <div className="aside-label"><BuildBadge /></div>
          </>
        }
      >
        {children}
      </AdminShell>
    </OverlayStatusProvider>
  );
}

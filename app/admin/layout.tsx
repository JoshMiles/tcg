import { PendingButton } from './components/PendingButton';
import { AdminNav } from './components/AdminNav';
import { AdminKeyboard, PaletteButton } from './components/AdminKeyboard';
import { AdminShell } from './components/AdminShell';
import { BrandMark } from './components/BrandMark';
import { BuildBadge } from './components/BuildBadge';
import { OverlayStatus } from './components/OverlayStatus';
import { OverlayStatusProvider } from './components/OverlayStatusContext';
import { CopyUrlButton } from './components/copy-url-button';
import { Icon } from '@/app/components/Icon';
import { SandboxPill } from '@/app/components/SandboxPill';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <OverlayStatusProvider>
      <AdminShell
        brand={
          <div className="flex items-center gap-3">
            <BrandMark />
            <div className="aside-label min-w-0">
              <p className="font-display text-yellow-400 font-bold text-lg leading-none tracking-tight">The Cheesy TCG</p>
              <p className="text-gray-500 text-[10px] mt-1.5 font-bold uppercase tracking-[0.18em]">Card Manager</p>
            </div>
          </div>
        }
        nav={<><div className="px-3 pt-1"><PaletteButton /></div><AdminNav /></>}
        status={<OverlayStatus variant="compact" />}
        footer={
          <>
            <div className="aside-stack flex items-stretch gap-1.5">
              <CopyUrlButton />
              <a
                href="/overlay.html"
                target="_blank"
                title="Preview the overlay in a new tab"
                className="aside-item flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-gray-300 hover:text-white text-xs font-semibold transition-colors"
              >
                <Icon name="external" /><span className="aside-label truncate">Preview</span>
              </a>
            </div>
            <div className="aside-stack flex items-center gap-2 pt-2.5 border-t border-white/[0.06]">
              <div className="aside-item flex items-center gap-2.5 min-w-0 flex-1">
                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400/30 to-yellow-600/10 border border-yellow-400/30 text-yellow-200 flex items-center justify-center shrink-0" aria-hidden><Icon name="user" /></span>
                <div className="aside-label min-w-0 leading-tight">
                  <p className="text-xs font-bold text-gray-200 truncate">Admin</p>
                  <p className="text-[10px] text-gray-500 truncate">Signed in</p>
                </div>
              </div>
              <form action="/api/auth/logout" method="POST" className="aside-label">
                <PendingButton title="Log out" aria-label="Log out" className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-300 hover:bg-red-500/10 transition-colors">
                  <Icon name="logout" />
                </PendingButton>
              </form>
            </div>
            <div className="aside-label flex justify-center"><BuildBadge /></div>
          </>
        }
      >
        <SandboxPill />
        <AdminKeyboard />
        {children}
      </AdminShell>
    </OverlayStatusProvider>
  );
}

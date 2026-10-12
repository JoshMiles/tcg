import { Icon } from '@/app/components/Icon';
import { PendingButton } from '../admin/components/PendingButton';
import Link from 'next/link';
import { currentSandboxId } from '@/lib/db';
import { getSandbox } from '@/lib/sandbox';

/**
 * A small fixed pill, shown on every admin and website page while the browser is in a sandbox, so it is always obvious that
 * what you see (and change) is test data. Renders nothing on production.
 */
export async function SandboxPill() {
  const id = await currentSandboxId();
  if (!id) return null;
  const sandbox = await getSandbox(id);
  return (
    <>
    {/* A thin bar across the top of every page, so a sandbox is never mistaken for production even when the pill is out of sight. */}
    <div aria-hidden className="fixed top-0 inset-x-0 h-[3px] z-[70] bg-gradient-to-r from-purple-500 via-fuchsia-400 to-purple-500 pointer-events-none" />
    <div className="fixed bottom-3 lg:bottom-auto lg:top-2 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 rounded-full border border-purple-400/50 bg-purple-950/90 backdrop-blur px-3.5 py-1.5 text-xs font-semibold text-purple-100 shadow-lg shadow-purple-950/50">
      <Icon name="flask" />
      <span>Sandbox: {sandbox?.name ?? 'missing'}{!sandbox && ' (deleted)'}</span>
      <span className="text-purple-400/60" aria-hidden>·</span>
      {sandbox && <Link href={`/admin/sandbox/${sandbox.id}`} className="underline decoration-dotted hover:text-white">Tools</Link>}
      <form action="/api/sandbox/exit?to=/admin/sandbox" method="POST">
        <PendingButton className="underline decoration-dotted hover:text-white">Exit</PendingButton>
      </form>
    </div>
    </>
  );
}

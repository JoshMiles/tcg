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
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 rounded-full border border-purple-400/50 bg-purple-950/90 backdrop-blur px-3.5 py-1.5 text-xs font-semibold text-purple-100 shadow-lg shadow-purple-950/50">
      <span aria-hidden>🧪</span>
      <span>Sandbox: {sandbox?.name ?? 'missing'}{!sandbox && ' (deleted)'}</span>
      <span className="text-purple-400/60" aria-hidden>·</span>
      {sandbox && <Link href={`/admin/sandbox/${sandbox.id}`} className="underline decoration-dotted hover:text-white">Tools</Link>}
      <form action="/api/sandbox/exit?to=/admin/sandbox" method="POST">
        <PendingButton className="underline decoration-dotted hover:text-white">Exit</PendingButton>
      </form>
    </div>
  );
}

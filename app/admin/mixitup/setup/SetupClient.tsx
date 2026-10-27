'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { presetHref, type PresetSpec } from '@/lib/mixitup-presets';

const secondary = 'btn btn-sm btn-outline';

/** Re-reads the step's server data every few seconds while the tab is visible, so a step turns green by itself once Mix It Up or TCG Bridge connects. */
export function AutoRefresh({ ms = 3000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) router.refresh(); }, ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return <p className="text-xs text-gray-500">This page checks every few seconds.</p>;
}

/** Download for Mix It Up (ROADMAP 55.5): the staff-only route builds the file with the real secret in it. */
export function DownloadPreset({ spec }: { spec: PresetSpec }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <a href={presetHref(spec)} download className={secondary}><Icon name="download" />Download for Mix It Up</a>
      <p className="text-xs text-gray-500 min-w-0 flex-1">The file holds your incoming secret: do not share it. If it leaks, <Link href="/admin/settings?tab=webhooks" className="link">make a new secret</Link>.</p>
    </div>
  );
}

/** A Copy setup card: the address and body of one Web Request action, each with a Copy button. */
export function CopyCard({ title, url, body, note, download }: { title: string; url: string; body: string; note?: string; download?: PresetSpec }) {
  const copy = (t: string) => { try { void navigator.clipboard.writeText(t); } catch { /* clipboard blocked */ } };
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-4 space-y-3">
      <h3 className="font-semibold text-white text-sm">Copy setup: {title}</h3>
      {note && <p className="text-xs text-gray-500">{note}</p>}
      <div>
        <p className="block text-xs font-semibold text-gray-300 mb-1">Address</p>
        <div className="flex gap-2">
          <code className="flex-1 min-w-0 break-all rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs">{url}</code>
          <button type="button" onClick={() => copy(url)} className={`${secondary} self-start`}><Icon name="copy" />Copy</button>
        </div>
      </div>
      <div>
        <p className="block text-xs font-semibold text-gray-300 mb-1">Body</p>
        <div className="flex gap-2">
          <pre className="flex-1 min-w-0 overflow-auto rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs">{body}</pre>
          <button type="button" onClick={() => copy(body)} className={`${secondary} self-start`}><Icon name="copy" />Copy</button>
        </div>
      </div>
      {download && <DownloadPreset spec={download} />}
    </div>
  );
}

import Link from 'next/link';
import type { ReactNode } from 'react';
import { APP_NAME, LEGAL_UPDATED } from '@/lib/legal';

/** Shared shell for the Privacy Policy and Terms pages. */
export function LegalPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen text-gray-200">
      <div className="border-b border-poke-blue-light/20 bg-gray-950/70 backdrop-blur-sm">
        <div className="holo-strip" />
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-gray-500">{APP_NAME}</p>
            <h1 className="font-display text-3xl font-bold text-white leading-tight">{title}</h1>
          </div>
          <nav className="flex gap-4 text-xs text-yellow-500 shrink-0">
            <Link href="/privacy" className="hover:text-yellow-300 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-yellow-300 transition-colors">Terms</Link>
          </nav>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-4 py-8 space-y-8 text-sm leading-relaxed">
        <p className="text-xs text-gray-500">Last updated {LEGAL_UPDATED}</p>
        {intro && <div className="text-gray-300 space-y-3">{intro}</div>}
        {children}
      </article>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-bold text-white">{title}</h2>
      <div className="space-y-3 text-gray-300">{children}</div>
    </section>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-5 space-y-1.5 marker:text-gray-600">{children}</ul>;
}

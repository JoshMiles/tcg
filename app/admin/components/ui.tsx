import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/app/components/Icon';

// Small building blocks shared by every admin page, so they look and behave the same. Server- and client-safe (no state).

type Tone = 'amber' | 'green' | 'red';
const TONE_TEXT: Record<Tone, string> = { amber: 'text-amber-300', green: 'text-green-300', red: 'text-red-300' };
const TONE_ICON: Record<Tone, string> = { amber: 'text-amber-400', green: 'text-green-400', red: 'text-red-400' };

/** A headline number: small label, big value, optional sub line, icon, colour and link. */
export function Tile({ label, value, sub, tone, icon, href }: { label: string; value: string | number; sub?: string; tone?: Tone; icon?: IconName; href?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{label}</p>
        {icon && <Icon name={icon} className={tone ? TONE_ICON[tone] : 'text-gray-600'} />}
      </div>
      <p title={String(value)} className={`font-display font-bold tabular-nums leading-tight truncate ${String(value).length > 9 ? 'text-lg' : 'text-2xl'} ${tone ? TONE_TEXT[tone] : 'text-white'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-500 truncate">{sub}</p>}
    </>
  );
  const cls = 'block rounded-xl border border-gray-800 bg-gray-900/70 px-4 py-3 min-w-0';
  return href ? <Link href={href} className={`${cls} hover:border-yellow-500/40 transition-colors`}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** A titled card. `id` makes it a scroll target. */
export function Panel({ title, hint, icon, actions, id, children, className = '' }: {
  title?: ReactNode; hint?: ReactNode; icon?: IconName; actions?: ReactNode; id?: string; children: ReactNode; className?: string;
}) {
  return (
    <section id={id} className={`tcg-panel rounded-2xl p-5 space-y-3 ${id ? 'scroll-mt-16' : ''} ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="font-semibold text-white">{icon && <Icon name={icon} className="mr-2 text-yellow-400/90" />}{title}</h2>}
            {hint && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{hint}</p>}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** The page title block: optional back link, title, subtitle and a row of actions on the right. */
export function PageHeader({ title, subtitle, icon, back, actions }: { title: ReactNode; subtitle?: ReactNode; icon?: IconName; back?: { href: string; label: string }; actions?: ReactNode }) {
  return (
    <div className="space-y-2">
      {back && <Link href={back.href} className="inline-block text-sm text-gray-500 hover:text-white transition-colors">← {back.label}</Link>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-white break-words">{icon && <Icon name={icon} className="mr-2 text-yellow-400/90" />}{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Keeps a form or wizard readable on wide screens: centred with a sensible maximum width. Lists, tables and workspaces stay full width. */
export function Narrow({ size = 'lg', children, className = '' }: { size?: 'md' | 'lg' | 'xl'; children: ReactNode; className?: string }) {
  const w = { md: 'max-w-3xl', lg: 'max-w-5xl', xl: 'max-w-6xl' }[size];
  return <div className={`mx-auto w-full ${w} ${className}`}>{children}</div>;
}

/** What a list or tab shows when there is nothing in it yet. */
export function EmptyState({ icon = 'inbox', title, children, action, asH1 = false }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode; /** For a screen that is the whole page (not found): the title is the page's one heading. */ asH1?: boolean }) {
  const Title = asH1 ? 'h1' : 'p';
  return (
    <div className="tcg-panel rounded-2xl px-6 py-14 text-center">
      <span className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-gray-500 flex items-center justify-center"><Icon name={icon} className="w-6 h-6" /></span>
      <Title className="font-semibold text-gray-200">{title}</Title>
      {children && <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto leading-relaxed">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

const CHIP: Record<'green' | 'amber' | 'red' | 'gray' | 'purple', string> = {
  green: 'text-green-300 bg-green-500/10 border-green-400/30', amber: 'text-amber-300 bg-amber-500/10 border-amber-400/30',
  red: 'text-red-300 bg-red-500/10 border-red-400/30', gray: 'text-gray-400 bg-gray-800/60 border-gray-700', purple: 'text-purple-300 bg-purple-500/10 border-purple-400/30',
};
export function Chip({ tone = 'gray', children }: { tone?: keyof typeof CHIP; children: ReactNode }) {
  return <span className={`text-[10px] font-extrabold uppercase tracking-wider rounded-full px-2 py-0.5 border ${CHIP[tone]}`}>{children}</span>;
}

/** Class strings for form controls, so inputs look the same everywhere. */
export const fieldClass = 'block w-full rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none';
export const selectClass = 'rounded-xl bg-gray-950 border border-gray-700 px-2.5 py-2 text-sm text-gray-300 focus:outline-none focus:border-yellow-500';

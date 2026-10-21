// The strip under a workspace (zoom, size, unsaved count ...); it knows nothing about what it shows.

export function StatusBar({ children }: { children: React.ReactNode }) {
  return (
    <div aria-label="Status bar" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-gray-900/80 border border-gray-800 px-3 py-1 text-xs text-gray-400">
      {children}
    </div>
  );
}

/** One readout; with `onClick` it is a button. `tone` colours it as a warning. */
export function StatusItem({ children, title, onClick, tone }: { children: React.ReactNode; title?: string; onClick?: () => void; tone?: 'warn' | 'bad' }) {
  const cls = tone === 'bad' ? 'text-red-300' : tone === 'warn' ? 'text-yellow-400' : '';
  return onClick ? (
    <button type="button" title={title} onClick={onClick} className={`${cls} hover:text-white underline-offset-2 hover:underline`}>{children}</button>
  ) : (
    <span title={title} className={cls}>{children}</span>
  );
}

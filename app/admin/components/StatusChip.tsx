export function StatusChip({ active, activeLabel = 'Active', inactiveLabel = 'Inactive' }: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-green-300 bg-green-500/10 border border-green-400/30 rounded-full px-2.5 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow shadow-green-400/60" />
      {activeLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-gray-500 bg-gray-800/60 border border-gray-700/60 rounded-full px-2.5 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
      {inactiveLabel}
    </span>
  );
}

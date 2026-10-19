export function StatusChip({ active, activeLabel = 'Active', inactiveLabel = 'Inactive' }: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return active ? (
    <span className="badge badge-sm badge-success">{activeLabel}</span>
  ) : (
    <span className="badge badge-sm badge-ghost">{inactiveLabel}</span>
  );
}

/** Marks a pack or season that is saved but not yet published. */
export function DraftChip() {
  return <span className="badge badge-sm badge-warning">Draft</span>;
}

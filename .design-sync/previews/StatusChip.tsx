import { StatusChip } from 'cheesy-tcg';

export const States = () => (
  <div className="bg-gray-950 p-5 flex items-center gap-2">
    <StatusChip active />
    <StatusChip active={false} />
    <StatusChip active activeLabel="Live" />
    <StatusChip active={false} inactiveLabel="Ended" />
  </div>
);

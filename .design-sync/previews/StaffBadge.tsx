import { StaffBadge } from 'cheesy-tcg';

export const Roles = () => (
  <div className="bg-gray-950 p-5 flex items-center gap-2">
    <StaffBadge badge="streamer" />
    <StaffBadge badge="admin" />
    <StaffBadge badge="mod" />
    <StaffBadge badge="mod" compact />
  </div>
);

export const NextToName = () => (
  <div className="bg-gray-950 p-5">
    <span className="font-bold text-white">Cheesygidds</span> <StaffBadge badge="streamer" />
  </div>
);

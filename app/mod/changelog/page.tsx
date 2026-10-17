import { requireStaff } from '@/lib/staff-guard';
import { StaffChangelog } from '../../admin/components/StaffChangelog';

export const metadata = { title: "What's new · Mod", robots: { index: false } };
export const dynamic = 'force-dynamic';

/** The same staff What's new as the admin panel, for mods. */
export default async function ModChangelogPage() {
  await requireStaff('mod');
  return <StaffChangelog />;
}

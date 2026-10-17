import { StaffChangelog } from '../components/StaffChangelog';

export const metadata = { title: "What's new for staff", robots: { index: false } };

/** Changes to the admin and mod panels (the admin layout already checks the staff role). */
export default function AdminChangelogPage() {
  return <StaffChangelog />;
}

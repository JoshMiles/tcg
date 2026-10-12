import { SiteShell } from '@/app/components/site/SiteShell';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}

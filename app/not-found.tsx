import { SiteShell } from '@/app/components/site/SiteShell';
import { NotFoundBody } from '@/app/components/site/NotFoundBody';

// Any address that matches no page. (Pages inside the site frame use their own segment's not-found, which has no frame of its own.)
export default function NotFound() {
  return <SiteShell><NotFoundBody /></SiteShell>;
}

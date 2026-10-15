import { EmptyState } from '../components/ui';

/** Sandboxes are switched off on preview deployments: a preview is already isolated in its own namespace. */
export function PreviewOff() {
  return (
    <EmptyState icon="flask" title="Not available on preview deployments">
      This deployment is already walled off from the live data (it works in its own preview namespace), so sandboxes are switched off here. Use them on the live site, or manage the preview data in Settings, Environment.
    </EmptyState>
  );
}
